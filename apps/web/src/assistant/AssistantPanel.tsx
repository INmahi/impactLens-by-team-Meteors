// AI assistant (M12): an agentic chat that sets up and runs analyses for the user, then explains the result.
// It uses only four tools (assistant/tools.ts): it cannot compute statistics or change anything else.
// The only online feature of the app (CLAUDE.md offline rule); the key stays in this browser.
import { useEffect, useRef, useState } from 'react'
import { Activity, Copy, ExternalLink, RotateCcw, SendHorizontal, Settings2, Sparkles, WifiOff, X } from 'lucide-react'
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
  'Hi! I can set up and run a trend analysis for you, then explain what the result means. Tell me what you would like to look at, or pick one of these:'

const SUGGESTIONS = [
  'Is sea level rising faster in the Bay of Bengal than the world average?',
  'Compare monsoon rainfall in Rangpur and Sylhet divisions',
  'Is Greenland losing ice faster over time?',
]

/** Inline formatting: **bold** and `code`. */
function Inline({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, k) =>
        /^\*\*[^*]+\*\*$/.test(part) ? (
          <strong key={k} className="font-semibold">
            {part.slice(2, -2)}
          </strong>
        ) : /^`[^`]+`$/.test(part) ? (
          <code key={k} className="rounded bg-black/30 px-1 py-0.5 text-[12px]">
            {part.slice(1, -1)}
          </code>
        ) : (
          <span key={k}>{part}</span>
        ),
      )}
    </>
  )
}

/** Light Markdown: paragraphs, "- " and "1. " lists, "### " headings, bold and code. No HTML is rendered. */
function Text({ text }: { text: string }) {
  const blocks: { kind: 'p' | 'ul' | 'ol' | 'h'; lines: string[] }[] = []
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd()
    if (!line.trim()) {
      blocks.push({ kind: 'p', lines: [] })
      continue
    }
    const ul = /^\s*[-*•]\s+(.*)$/.exec(line)
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line)
    const h = /^\s*#{1,4}\s+(.*)$/.exec(line)
    const kind = ul ? 'ul' : ol ? 'ol' : h ? 'h' : 'p'
    const content = (ul ?? ol ?? h)?.[1] ?? line
    const last = blocks[blocks.length - 1]
    if (last && last.kind === kind && kind !== 'h' && kind !== 'p') last.lines.push(content)
    else blocks.push({ kind, lines: [content] })
  }
  return (
    <div className="flex flex-col gap-1.5">
      {blocks
        .filter((b) => b.lines.length)
        .map((b, i) =>
          b.kind === 'ul' || b.kind === 'ol' ? (
            (() => {
              const L = b.kind === 'ul' ? 'ul' : 'ol'
              return (
                <L key={i} className={cn('flex flex-col gap-0.5 pl-4', b.kind === 'ul' ? 'list-disc' : 'list-decimal')}>
                  {b.lines.map((l, k) => (
                    <li key={k}>
                      <Inline text={l} />
                    </li>
                  ))}
                </L>
              )
            })()
          ) : b.kind === 'h' ? (
            <p key={i} className="font-semibold">
              <Inline text={b.lines[0]} />
            </p>
          ) : (
            <p key={i}>
              <Inline text={b.lines.join(' ')} />
            </p>
          ),
        )}
    </div>
  )
}

const FOLLOW_UPS = ['Explain this result simply', 'What does the p-value mean here?', 'What does the 95% interval mean?', 'Compare with another region']

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
  // Escape closes the pop-up (the conversation is kept).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

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

  // A request from elsewhere in the app (the "AI summary" offer after a manual run) is sent once the panel is open.
  const aiRequest = useAppStore((s) => s.aiRequest)
  const sendRef = useRef(send)
  sendRef.current = send
  useEffect(() => {
    if (!open || !aiRequest || busy) return
    useAppStore.getState().setAiRequest(null)
    void sendRef.current(aiRequest)
  }, [open, aiRequest, busy])

  function update(c: Partial<LlmConfig>) {
    const next = { ...cfg, ...c }
    setCfg(next)
    saveConfig(next)
  }

  if (!open) return null
  const preset = cfg.provider === 'custom' ? null : PRESETS[cfg.provider]
  const ready = online && !!cfg.apiKey
  const started = shown.length > 1

  return (
    <section
      role="dialog"
      aria-label="AI assistant"
      className={cn(
        'pointer-events-auto flex flex-col overflow-hidden rounded-2xl border border-white/15 bg-slate-950/90 text-white shadow-2xl shadow-black/60 backdrop-blur-xl',
        'animate-in fade-in zoom-in-95 slide-in-from-top-2 duration-200 motion-reduce:animate-none',
        className,
      )}
    >
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-white/10 bg-gradient-to-r from-sky-500/20 via-indigo-500/10 to-transparent px-4 py-3">
        <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-sky-300 to-indigo-400 text-slate-950 shadow-md">
          <Sparkles className="size-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] leading-tight font-semibold">Trend Detective AI</h2>
          <p className="flex items-center gap-1.5 truncate text-[11.5px] text-white/75" title={`${cfg.model} via ${cfg.baseUrl}`}>
            <span aria-hidden className={cn('size-1.5 shrink-0 rounded-full', ready ? 'bg-emerald-400' : 'bg-amber-300')} />
            {!online ? 'Offline' : !cfg.apiKey ? 'Add an API key in settings' : 'Online'} · {cfg.model}
          </p>
        </div>
        <button
          type="button"
          aria-label="Start a new chat"
          title="New chat"
          onClick={() => {
            history.current = []
            setShown([{ role: 'assistant', text: WELCOME }])
          }}
          disabled={busy}
          className="grid size-8 place-items-center rounded-lg text-white/85 hover:bg-white/10 disabled:opacity-40"
        >
          <RotateCcw className="size-4" />
        </button>
        <button
          type="button"
          aria-label="Assistant settings"
          aria-expanded={showSettings}
          onClick={() => setShowSettings((x) => !x)}
          className={cn('grid size-8 place-items-center rounded-lg text-white/85 hover:bg-white/10', showSettings && 'bg-white/10')}
        >
          <Settings2 className="size-4" />
        </button>
        <button type="button" onClick={onClose} aria-label="Close the AI assistant" className="grid size-8 place-items-center rounded-lg text-white/85 hover:bg-white/10">
          <X className="size-4" />
        </button>
      </header>

      {showSettings && (
        <div className="flex flex-col gap-2.5 border-b border-white/10 bg-black/30 px-4 py-3 text-[12.5px] animate-in fade-in slide-in-from-top-1 duration-150">
          <label className="flex flex-col gap-1 text-white/85">
            Provider
            <select
              value={cfg.provider}
              onChange={(e) => {
                const p = e.target.value as LlmConfig['provider']
                update(p === 'custom' ? { provider: p } : { provider: p, baseUrl: PRESETS[p].baseUrl, model: PRESETS[p].model })
              }}
              className="h-8 rounded-lg border border-white/15 bg-slate-900 px-2 text-white"
            >
              <option value="groq">{PRESETS.groq.label}</option>
              <option value="openrouter">{PRESETS.openrouter.label}</option>
              <option value="custom">Other OpenAI-compatible endpoint</option>
            </select>
          </label>
          {cfg.provider === 'custom' && (
            <label className="flex flex-col gap-1 text-white/85">
              Endpoint URL
              <input value={cfg.baseUrl} onChange={(e) => update({ baseUrl: e.target.value })} className="h-8 rounded-lg border border-white/15 bg-slate-900 px-2 text-white" />
            </label>
          )}
          <label className="flex flex-col gap-1 text-white/85">
            Model
            <input value={cfg.model} onChange={(e) => update({ model: e.target.value })} className="h-8 rounded-lg border border-white/15 bg-slate-900 px-2 text-white" />
          </label>
          <label className="flex flex-col gap-1 text-white/85">
            API key <span className="text-[11px] text-white/60">stored only in this browser</span>
            <input
              type="password"
              autoComplete="off"
              value={cfg.apiKey}
              onChange={(e) => update({ apiKey: e.target.value.trim() })}
              placeholder="Paste your free key"
              className="h-8 rounded-lg border border-white/15 bg-slate-900 px-2 text-white"
            />
          </label>
          {preset && (
            <a href={preset.keyUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sky-200 underline underline-offset-2">
              Get a free key <ExternalLink className="size-3" />
            </a>
          )}
        </div>
      )}

      {/* Conversation */}
      <div ref={listRef} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-4 py-4 text-[13.5px] leading-relaxed" aria-live="polite">
        {shown.map((m, i) =>
          m.role === 'status' ? (
            <p key={i} className="flex items-center gap-1.5 self-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11.5px] text-white/80">
              <Activity aria-hidden className="size-3 text-sky-300" />
              {m.text}
            </p>
          ) : m.role === 'user' ? (
            <div key={i} className="max-w-[85%] self-end rounded-2xl rounded-br-md bg-sky-300 px-3.5 py-2 text-slate-950 shadow-sm">
              <Text text={m.text} />
            </div>
          ) : (
            <div key={i} className="group/msg flex max-w-[92%] items-start gap-2 self-start">
              <span aria-hidden className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-gradient-to-br from-sky-300 to-indigo-400 text-slate-950">
                <Sparkles className="size-3" />
              </span>
              <div
                className={cn(
                  'rounded-2xl rounded-tl-md px-3.5 py-2 shadow-sm',
                  m.role === 'error' ? 'border border-red-300/50 bg-red-500/15 text-red-50' : 'border border-white/10 bg-white/[0.07]',
                )}
              >
                <Text text={m.text} />
              </div>
              {m.role === 'assistant' && i > 0 && (
                <button
                  type="button"
                  aria-label="Copy this answer"
                  title="Copy"
                  onClick={() => void navigator.clipboard?.writeText(m.text).catch(() => {})}
                  className="mt-1 grid size-6 shrink-0 place-items-center rounded-md text-white/50 opacity-0 transition-opacity group-hover/msg:opacity-100 hover:bg-white/10 hover:text-white focus-visible:opacity-100"
                >
                  <Copy className="size-3.5" />
                </button>
              )}
            </div>
          ),
        )}

        {started && !busy && analysis && shown[shown.length - 1]?.role === 'assistant' && (
          <div className="flex flex-wrap gap-1.5 pl-8">
            {FOLLOW_UPS.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => void send(q)}
                className="rounded-full border border-white/15 bg-white/[0.04] px-2.5 py-1 text-[11.5px] text-white/85 transition-colors hover:border-sky-300/60 hover:bg-sky-300/10"
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {!started && (
          <div className="flex flex-col gap-1.5 pl-8">
            {SUGGESTIONS.map((q) => (
              <button
                key={q}
                type="button"
                disabled={busy}
                onClick={() => void send(q)}
                className="rounded-xl border border-white/15 bg-white/[0.04] px-3 py-1.5 text-left text-[12.5px] text-white/90 transition-colors hover:border-sky-300/60 hover:bg-sky-300/10"
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {busy && (
          <div className="flex items-center gap-2 self-start" aria-label="The assistant is thinking">
            <span aria-hidden className="grid size-6 place-items-center rounded-full bg-gradient-to-br from-sky-300 to-indigo-400 text-slate-950">
              <Sparkles className="size-3" />
            </span>
            <span className="flex gap-1 rounded-2xl border border-white/10 bg-white/[0.07] px-3 py-2.5">
              {[0, 150, 300].map((d) => (
                <span key={d} className="size-1.5 animate-bounce rounded-full bg-white/70 motion-reduce:animate-none" style={{ animationDelay: `${d}ms` }} />
              ))}
            </span>
          </div>
        )}
      </div>

      {!online && (
        <p className="flex items-center gap-1.5 border-t border-amber-300/20 bg-amber-300/10 px-4 py-2 text-[12px] text-amber-100">
          <WifiOff aria-hidden className="size-3.5" /> The assistant needs internet. Everything else works offline.
        </p>
      )}

      {/* Composer */}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void send(input)
        }}
        className="border-t border-white/10 bg-black/20 p-3"
      >
        <div className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] py-1 pr-1 pl-3 focus-within:border-sky-300/70 focus-within:ring-2 focus-within:ring-sky-300/30">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={analysis ? 'Ask about this result, or start a new analysis…' : 'Ask me to analyse something…'}
            aria-label="Message to the AI assistant"
            disabled={busy}
            className="h-8 min-w-0 flex-1 bg-transparent text-sm text-white placeholder:text-white/50 focus:outline-none disabled:opacity-60"
          />
          <button
            type="submit"
            aria-label="Send"
            disabled={busy || !input.trim()}
            className="grid size-8 shrink-0 place-items-center rounded-lg bg-sky-300 text-slate-950 transition-opacity hover:bg-sky-200 disabled:opacity-40"
          >
            <SendHorizontal className="size-4" />
          </button>
        </div>
        <p className="mt-2 text-center text-[10.5px] text-white/55">
          AI can make mistakes. Every number comes from the app&apos;s own analysis, never from the AI.
        </p>
      </form>
    </section>
  )
}
