// AI assistant (M12): an agentic chat that sets up and runs analyses for the user, then explains the result.
// It uses only four tools (assistant/tools.ts): it cannot compute statistics or change anything else.
// The only online feature of the app (CLAUDE.md offline rule); the key stays in this browser.
import { useEffect, useRef, useState } from 'react'
import { cn } from 'cn'
import { useAppStore } from '@/state/store'
import { chat, loadConfig, PRESETS, saveConfig, type ChatMessage, type LlmConfig } from './llm'
import { runTool, TOOLS } from './tools'

const SYSTEM = `You are the Trend Detective assistant inside a NASA Space Apps web app that tests whether Earth-system records are changing (Mann-Kendall test, Sen's slope with a 95% interval).
SCOPE: only this app: its variables, regions and time ranges, running analyses, explaining results, statistics (trend test, p-value, 95% interval, autocorrelation, low power, comparing regions, correlation) and the data sources. For anything else, say in one sentence that you can only help with this app.
WORKFLOW: 1) Understand what the user wants. Call get_catalog before offering choices; never offer a variable or region that is not in it. 2) Ask ONE short question at a time for what is missing: variable; region (list the valid regions for that variable by name); time period (default: the full record, say its years; the user may pick a shorter range); compare (optional: another region of the same variable, or up to 3 other variables in the same region). Skip anything the user already said. 3) When everything is known, call set_analysis_inputs, then call run_analysis. 4) Summarise the tool output in 3-5 short sentences: the verdict, the trend with its 95% interval and units, the p-value, the dataset name, and one caveat. Then offer to explain or to run another analysis.
RULES: Never compute, estimate or invent a number: quote only tool outputs. Every rate comes with its 95% interval. If a result is not significant say "cannot tell yet", never "no change" or "no trend". Never claim a cause from a trend or a correlation. Regional sea level is an average over an open-sea area, not the value at a town, and land sinking is not included. Never say warm air is melting Antarctica: Antarctic ice loss is driven mainly by warm ocean water. If the dataset is synthetic, say so. Plain English for students; short replies; no tables.`

type Shown = { role: 'user' | 'assistant' | 'status' | 'error'; text: string }

const WELCOME =
  'Hi! I can set up and run a trend analysis for you, then explain the result. Try: "Is sea level rising faster in the Bay of Bengal than the world average?" or "How has Bangladesh monsoon rain changed?"'

/** Light formatting: **bold** and line breaks only. */
function Text({ text }: { text: string }) {
  return (
    <>
      {text.split('\n').map((line, i) => (
        <p key={i} className={cn(i > 0 && 'mt-1.5')}>
          {line.split(/(\*\*[^*]+\*\*)/g).map((part, k) =>
            /^\*\*[^*]+\*\*$/.test(part) ? <strong key={k}>{part.slice(2, -2)}</strong> : <span key={k}>{part}</span>,
          )}
        </p>
      ))}
    </>
  )
}

export default function AssistantPanel({ open, onClose, className }: { open: boolean; onClose: () => void; className?: string }) {
  const [cfg, setCfg] = useState<LlmConfig>(() => loadConfig())
  const [showSettings, setShowSettings] = useState(false)
  const [shown, setShown] = useState<Shown[]>([{ role: 'assistant', text: WELCOME }])
  const history = useRef<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine)
  const listRef = useRef<HTMLDivElement>(null)
  const analysis = useAppStore((s) => s.analysis)

  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [shown, busy])

  // When the user runs an analysis with the button, tell the assistant (so follow-up questions refer to it).
  const lastSeen = useRef<unknown>(null)
  useEffect(() => {
    if (!analysis || analysis.report === lastSeen.current) return
    lastSeen.current = analysis.report
    history.current.push({ role: 'user', content: '[The app now shows a new analysis result. Call get_result before answering questions about it.]' })
  }, [analysis])

  async function send(text: string) {
    if (!text.trim() || busy) return
    setInput('')
    setShown((s) => [...s, { role: 'user', text }])
    history.current.push({ role: 'user', content: text })
    // Keep the request small (free tier: 8,000 tokens a minute): the last 14 messages, never starting on a tool reply.
    const trimmed = () => {
      let h = history.current.slice(-14)
      while (h.length && h[0].role === 'tool') h = h.slice(1)
      return h
    }
    setBusy(true)
    try {
      for (let step = 0; step < 8; step++) {
        const reply = await chat(cfg, [{ role: 'system', content: SYSTEM }, ...trimmed()], TOOLS, (sec) =>
          setShown((s) => [...s, { role: 'status', text: `Free-tier limit reached; waiting ${sec} s…` }]),
        )
        history.current.push({ role: 'assistant', content: reply.content ?? null, tool_calls: reply.tool_calls })
        if (!reply.tool_calls) {
          setShown((s) => [...s, { role: 'assistant', text: reply.content?.trim() || '(no answer)' }])
          break
        }
        if (reply.content?.trim()) setShown((s) => [...s, { role: 'assistant', text: reply.content!.trim() }])
        for (const call of reply.tool_calls) {
          const result = await runTool(call.function.name, call.function.arguments, (st) => setShown((s) => [...s, { role: 'status', text: st }]))
          history.current.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result).slice(0, 6000) })
        }
      }
    } catch (e) {
      setShown((s) => [...s, { role: 'error', text: e instanceof Error ? e.message : String(e) }])
    } finally {
      setBusy(false)
    }
  }

  function update(c: Partial<LlmConfig>) {
    const next = { ...cfg, ...c }
    setCfg(next)
    saveConfig(next)
  }

  if (!open) return null
  const preset = cfg.provider === 'custom' ? null : PRESETS[cfg.provider]

  return (
    <section aria-label="AI assistant" className={cn('glass-strong pointer-events-auto flex flex-col overflow-hidden text-white', className)}>
      <header className="flex items-center justify-between gap-2 border-b border-white/10 px-4 pt-3 pb-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-wide">AI assistant</h2>
          <p className="truncate text-[11px] text-white/75" title={`${cfg.model} via ${cfg.baseUrl}`}>
            {cfg.model} · {preset?.label ?? 'custom endpoint'} · needs internet
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            aria-expanded={showSettings}
            onClick={() => setShowSettings((x) => !x)}
            className="rounded-md px-2 py-0.5 text-xs text-white/90 hover:bg-white/10"
          >
            Settings
          </button>
          <button type="button" onClick={onClose} aria-label="Close the AI assistant" className="rounded-md px-2 py-0.5 text-base font-semibold text-white/90 hover:bg-white/10">
            ×
          </button>
        </div>
      </header>

      {showSettings && (
        <div className="flex flex-col gap-2 border-b border-white/10 bg-black/20 px-4 py-3 text-[12.5px]">
          <label className="flex flex-col gap-1">
            Provider
            <select
              value={cfg.provider}
              onChange={(e) => {
                const p = e.target.value as LlmConfig['provider']
                update(p === 'custom' ? { provider: p } : { provider: p, baseUrl: PRESETS[p].baseUrl, model: PRESETS[p].model })
              }}
              className="h-8 rounded-md border border-white/20 bg-slate-900 px-2 text-white"
            >
              <option value="groq">{PRESETS.groq.label}</option>
              <option value="openrouter">{PRESETS.openrouter.label}</option>
              <option value="custom">Other OpenAI-compatible endpoint</option>
            </select>
          </label>
          {cfg.provider === 'custom' && (
            <label className="flex flex-col gap-1">
              Endpoint URL
              <input value={cfg.baseUrl} onChange={(e) => update({ baseUrl: e.target.value })} className="h-8 rounded-md border border-white/20 bg-slate-900 px-2 text-white" />
            </label>
          )}
          <label className="flex flex-col gap-1">
            Model
            <input value={cfg.model} onChange={(e) => update({ model: e.target.value })} className="h-8 rounded-md border border-white/20 bg-slate-900 px-2 text-white" />
          </label>
          <label className="flex flex-col gap-1">
            API key (stored only in this browser)
            <input
              type="password"
              autoComplete="off"
              value={cfg.apiKey}
              onChange={(e) => update({ apiKey: e.target.value.trim() })}
              placeholder="paste your free key"
              className="h-8 rounded-md border border-white/20 bg-slate-900 px-2 text-white"
            />
          </label>
          {preset && (
            <a href={preset.keyUrl} target="_blank" rel="noreferrer" className="text-sky-200 underline underline-offset-2">
              Get a free key
            </a>
          )}
        </div>
      )}

      <div ref={listRef} className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain px-4 py-3 text-[13.5px] leading-snug" aria-live="polite">
        {shown.map((m, i) =>
          m.role === 'status' ? (
            <p key={i} className="self-center rounded-full bg-white/10 px-3 py-1 text-[12px] text-white/85 italic">
              {m.text}
            </p>
          ) : (
            <div
              key={i}
              className={cn(
                'max-w-[92%] rounded-xl px-3 py-2',
                m.role === 'user' && 'self-end bg-sky-300 text-slate-950',
                m.role === 'assistant' && 'self-start bg-white/10',
                m.role === 'error' && 'self-start border border-red-300/60 bg-red-400/15 text-red-50',
              )}
            >
              <Text text={m.text} />
            </div>
          ),
        )}
        {busy && <p className="self-start text-[12px] text-white/75 italic">Thinking…</p>}
      </div>

      {!online && <p className="border-t border-white/10 px-4 py-2 text-[12px] text-amber-100">Offline: the assistant needs internet. Everything else in the app works offline.</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void send(input)
        }}
        className="flex gap-2 border-t border-white/10 p-3"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={analysis ? 'Ask about the result, or start a new analysis' : 'What would you like to analyse?'}
          aria-label="Message to the AI assistant"
          disabled={busy}
          className="h-9 min-w-0 flex-1 rounded-lg border border-white/20 bg-white/5 px-3 text-sm text-white placeholder:text-white/60 disabled:opacity-60"
        />
        <button type="submit" disabled={busy || !input.trim()} className="h-9 rounded-lg bg-sky-300 px-3 text-sm font-medium text-slate-950 disabled:opacity-50">
          Send
        </button>
      </form>
      <p className="px-4 pb-2 text-[10.5px] text-white/70">
        AI answers can be wrong. All numbers come from the app&apos;s own analysis; the AI does not compute statistics.
      </p>
    </section>
  )
}

