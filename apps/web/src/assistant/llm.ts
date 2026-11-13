// Minimal OpenAI-compatible chat client (Groq, OpenRouter, or any compatible endpoint) with tool calling.
// The assistant is the app's ONLY online feature (CLAUDE.md offline rule). The key stays in this browser.

export interface ToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}
export type ChatMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; name?: string; content: string } // Groq's gpt-oss template needs the name

export interface ToolSpec {
  type: 'function'
  function: { name: string; description: string; parameters: Record<string, unknown> }
}

export interface LlmConfig {
  provider: 'groq' | 'openrouter' | 'custom'
  baseUrl: string
  model: string
  apiKey: string
}

export const PRESETS: Record<'groq' | 'openrouter', { baseUrl: string; model: string; label: string; keyUrl: string }> = {
  groq: { baseUrl: 'https://api.groq.com/openai/v1', model: 'openai/gpt-oss-120b', label: 'Groq (free tier)', keyUrl: 'https://console.groq.com/keys' },
  openrouter: { baseUrl: 'https://openrouter.ai/api/v1', model: 'openai/gpt-oss-120b:free', label: 'OpenRouter (free models)', keyUrl: 'https://openrouter.ai/keys' },
}

const STORE_KEY = 'td-assistant-config'

/** Saved settings; in development the key may come from apps/web/.env.local (never in a production build). */
export function loadConfig(): LlmConfig {
  let saved: Partial<LlmConfig> = {}
  try {
    saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}')
  } catch {
    saved = {}
  }
  const provider = saved.provider ?? 'groq'
  const preset = provider === 'custom' ? PRESETS.groq : PRESETS[provider]
  const devKey = import.meta.env.DEV ? ((import.meta.env.VITE_LLM_API_KEY as string | undefined) ?? '') : ''
  return {
    provider,
    baseUrl: saved.baseUrl || preset.baseUrl,
    model: saved.model || preset.model,
    apiKey: saved.apiKey || devKey,
  }
}

export function saveConfig(c: LlmConfig) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(c))
  } catch {
    // private window: settings last for this visit only
  }
}

export class LlmError extends Error {}

/**
 * Groq free-tier limits are per model (e.g. about 8,000 tokens a minute for gpt-oss-120b), so when the chosen
 * model is rate-limited the request moves to the next model in this list, which has its own allowance. A model
 * Groq no longer serves is simply skipped.
 */
// Checked 2026-11-14: a free key's chat models are gpt-oss-120b, gpt-oss-20b and qwen3.8-27b; Qwen called the
// wrong tools in a test, so the only backup is gpt-oss-20b (same tool format, its own 8,000 tokens a minute).
const GROQ_BACKUPS = ['openai/gpt-oss-20b']

/** Model id -> time (ms) until which it is rate-limited, so later rounds skip it without a wasted request. */
const coolUntil = new Map<string, number>()

/** Seconds to wait, from Groq's message ("Please try again in 1m2.5s" / "in 7.66s") or the Retry-After header. */
function waitSeconds(r: Response, msg: string): number {
  const m = /try again in\s*(?:(\d+)h)?\s*(?:(\d+)m(?!s))?\s*(?:([\d.]+)s)?/i.exec(msg)
  if (m && (m[1] || m[2] || m[3])) return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)
  const ra = Number(r.headers.get('retry-after'))
  return ra > 0 ? ra : 8
}

/**
 * One chat completion. On a rate limit (429, or 413 "request too large" for the model's per-minute allowance)
 * it first tries the Groq backup models, then waits as long as the server asks (up to 3 times, at most 60 s).
 */
export async function chat(
  cfg: LlmConfig,
  messages: ChatMessage[],
  tools: ToolSpec[],
  onWait?: (seconds: number) => void,
): Promise<{ content: string | null; tool_calls?: ToolCall[] }> {
  if (!cfg.apiKey) throw new LlmError('No API key: open the assistant settings and paste your free key.')
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new LlmError('The assistant needs internet. The rest of the app works offline.')
  const models = [cfg.model, ...(cfg.provider === 'groq' ? GROQ_BACKUPS.filter((m) => m !== cfg.model) : [])]
  const dead = new Set<string>() // not served or cannot use tools: skip for this request
  for (let waits = 0; ; ) {
    const now = Date.now()
    const usable = models.filter((m) => !dead.has(m))
    const model = usable.find((m) => (coolUntil.get(m) ?? 0) <= now)
    if (!model) {
      if (!usable.length) throw new LlmError('No AI model is available right now. Try again later.')
      const soonest = Math.min(...usable.map((m) => coolUntil.get(m) ?? now))
      const wait = Math.max(2, Math.ceil((soonest - now) / 1000))
      if (waits >= 3 || wait > 60)
        throw new LlmError(`The free AI allowance is used up for now (about ${wait > 90 ? `${Math.ceil(wait / 60)} min` : `${wait} s`}). The rest of the app keeps working.`)
      waits++
      onWait?.(wait)
      await new Promise((res) => setTimeout(res, wait * 1000))
      continue
    }
    const body: Record<string, unknown> = { model, messages, tools, tool_choice: 'auto', temperature: 0.2, max_tokens: 800 }
    if (/gpt-oss/.test(model)) body.reasoning_effort = 'low'
    let r: Response
    try {
      r = await fetch(`${cfg.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json', 'X-Title': 'ImpactLens' },
        body: JSON.stringify(body),
      })
    } catch {
      throw new LlmError('Could not reach the AI service. Check the internet connection.')
    }
    const j = await r.json().catch(() => ({}))
    if (!r.ok) {
      const msg = (j as { error?: { message?: string } }).error?.message ?? `HTTP ${r.status}`
      if (r.status === 401) throw new LlmError('The API key was not accepted. Check it in the assistant settings.')
      if (r.status === 429 || r.status === 413 || /rate limit|tokens per minute|request too large/i.test(msg)) {
        coolUntil.set(model, Date.now() + waitSeconds(r, msg) * 1000)
        continue
      }
      // A model Groq no longer serves, or one that failed to call a tool: try the next one.
      if (models.length > 1 && (r.status === 404 || /not found|does not exist|decommissioned|tool_use_failed|not support|failed to template|harmony/i.test(msg))) {
        dead.add(model)
        continue
      }
      throw new LlmError(`AI service error: ${msg}`)
    }
    const m = (j as { choices?: { message?: { content?: string | null; tool_calls?: ToolCall[] } }[] }).choices?.[0]?.message
    if (!m) throw new LlmError('The AI service sent an empty reply.')
    // Some models (Qwen) may put their reasoning in <think> tags inside the answer: never show it.
    const content = m.content?.replace(/<think>[\s\S]*?<\/think>/g, '').trim() ?? null
    return { content: content || null, tool_calls: m.tool_calls?.length ? m.tool_calls : undefined }
  }
}
