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
  | { role: 'tool'; tool_call_id: string; content: string }

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

/** One chat completion. Retries a rate limit (HTTP 429) up to 3 times, waiting as long as the server asks. */
export async function chat(
  cfg: LlmConfig,
  messages: ChatMessage[],
  tools: ToolSpec[],
  onWait?: (seconds: number) => void,
): Promise<{ content: string | null; tool_calls?: ToolCall[] }> {
  if (!cfg.apiKey) throw new LlmError('No API key: open the assistant settings and paste your free key.')
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new LlmError('The assistant needs internet. The rest of the app works offline.')
  const body: Record<string, unknown> = { model: cfg.model, messages, tools, tool_choice: 'auto', temperature: 0.2, max_tokens: 900 }
  if (/gpt-oss/.test(cfg.model)) body.reasoning_effort = 'low'
  for (let attempt = 0; ; attempt++) {
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
    if (r.status === 429 && attempt < 3) {
      const ra = Number(r.headers.get('retry-after')) || 8
      const wait = Math.min(60, Math.max(2, Math.ceil(ra)))
      onWait?.(wait)
      await new Promise((res) => setTimeout(res, wait * 1000))
      continue
    }
    const j = await r.json().catch(() => ({}))
    if (!r.ok) {
      const msg = (j as { error?: { message?: string } }).error?.message ?? `HTTP ${r.status}`
      if (r.status === 401) throw new LlmError('The API key was not accepted. Check it in the assistant settings.')
      throw new LlmError(`AI service error: ${msg}`)
    }
    const m = (j as { choices?: { message?: { content?: string | null; tool_calls?: ToolCall[] } }[] }).choices?.[0]?.message
    if (!m) throw new LlmError('The AI service sent an empty reply.')
    return { content: m.content ?? null, tool_calls: m.tool_calls?.length ? m.tool_calls : undefined }
  }
}
