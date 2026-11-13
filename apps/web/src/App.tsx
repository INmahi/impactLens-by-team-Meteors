// M6 layout: full-screen globe with glass panels on top (glass-ui skill).
// Desktop: left drawer (inputs), right column (globe controls, results, collapsible map options),
// bottom-centre time scroller. Phone (<768 px): one bottom sheet at a time, chosen from a tab bar.
// The overlay root passes pointer events through; only the panels capture them.
import { useEffect, useState } from 'react'
import ChartDrawer from '@/charts/ChartDrawer'
import TimeScroller from '@/components/TimeScroller'
import { Globe, GlobeControls, SyntheticWatermark, useActiveMode } from '@/globe'
import { usePhone } from '@/lib/useMedia'
import { useRegionsData } from '@/lib/useData'
import LeftDrawer from '@/panels/LeftDrawer'
import AssistantPanel from '@/assistant/AssistantPanel'
import DataSourcesDialog from '@/panels/DataSourcesDialog'
import MapPanel from '@/panels/MapPanel'
import RightDrawer from '@/panels/RightDrawer'
import { useAppStore } from '@/state/store'
import { cn } from 'cn'

function RegionChip() {
  const regionId = useAppStore((s) => s.region)
  const { data: regions } = useRegionsData()
  if (!regionId) return null
  const name = regions?.find((r) => r.id === regionId)?.name ?? regionId
  return (
    <span data-testid="selected-region" data-region-id={regionId} className="glass truncate px-2 py-1 text-xs text-white">
      {name}
    </span>
  )
}

export default function App() {
  const phone = usePhone()
  return (
    <main className="fixed inset-0 overflow-hidden bg-black text-foreground">
      <Globe />
      <div className="pointer-events-none absolute inset-0">{phone ? <PhoneOverlay /> : <DesktopOverlay />}</div>
    </main>
  )
}

// Drawer slide: transform only (cheap), off under prefers-reduced-motion.
const SLIDE = 'transition-transform duration-300 ease-out motion-reduce:transition-none'

/** Small glass tab that reopens a closed side drawer. */
function ReopenTab({ side, label, show, onClick }: { side: 'left' | 'right'; label: string; show: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      tabIndex={show ? 0 : -1}
      aria-hidden={!show}
      className={cn(
        'glass-strong pointer-events-auto absolute z-10 h-10 px-2.5 text-base font-semibold text-white transition-opacity duration-300 hover:bg-white/10 motion-reduce:transition-none',
        // Right tab sits below the globe zoom controls.
        side === 'left' ? 'left-3 top-16' : 'right-3 top-36',
        show ? 'opacity-100' : 'pointer-events-none opacity-0',
      )}
    >
      {side === 'left' ? '»' : '«'}
    </button>
  )
}

/** Header button that opens the AI assistant (the app's only online feature). */
function AskAiButton({ open, onClick, compact = false }: { open: boolean; onClick: () => void; compact?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={open}
      onClick={onClick}
      className={cn(
        'glass pointer-events-auto flex items-center gap-1.5 font-medium text-white hover:bg-white/10',
        compact ? 'px-2.5 py-1.5 text-xs' : 'px-3 py-1.5 text-sm',
        open && 'ring-2 ring-sky-300/70',
      )}
    >
      <span aria-hidden>✦</span>
      Ask AI
    </button>
  )
}

/** After a manual Run analysis: a small offer to have the AI assistant summarise the result (hides after 12 s). */
function AiSummaryOffer({ aiOpen, onAccept, className }: { aiOpen: boolean; onAccept: () => void; className?: string }) {
  const analysis = useAppStore((s) => s.analysis)
  const lastRunBy = useAppStore((s) => s.lastRunBy)
  const [show, setShow] = useState(false)
  useEffect(() => {
    if (!analysis || lastRunBy !== 'button' || aiOpen) return
    setShow(true)
    const t = setTimeout(() => setShow(false), 12000)
    return () => clearTimeout(t)
  }, [analysis]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (aiOpen) setShow(false)
  }, [aiOpen])
  if (!show) return null
  return (
    <div
      role="status"
      className={cn(
        'pointer-events-auto flex items-center gap-3 rounded-2xl border border-white/15 bg-slate-950/90 py-2 pr-2 pl-3 text-sm text-white shadow-2xl shadow-black/50 backdrop-blur-xl',
        'animate-in fade-in slide-in-from-top-2 duration-200 motion-reduce:animate-none',
        className,
      )}
    >
      <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-sky-300 to-indigo-400 text-slate-950">
        ✦
      </span>
      <span>Want a plain-language summary of this result?</span>
      <button
        type="button"
        onClick={() => {
          setShow(false)
          onAccept()
        }}
        className="rounded-lg bg-sky-300 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-sky-200"
      >
        AI summary
      </button>
      <button type="button" aria-label="Dismiss" onClick={() => setShow(false)} className="rounded-lg px-2 py-1 text-white/70 hover:bg-white/10">
        ×
      </button>
    </div>
  )
}

const SUMMARY_REQUEST =
  'Summarise the result now shown in the app for a non-expert: what was tested, the verdict, the trend with its 95% interval, the p-value, the dataset, and one caveat.'

function DesktopOverlay() {
  // Side drawers run full height and slide out sideways; the scroller and chart drawer sit between
  // them and widen (animated) when a drawer is closed.
  const [leftOpen, setLeftOpen] = useState(true)
  const [aiOpen, setAiOpen] = useState(false)
  const [rightOpen, setRightOpen] = useState(true)
  const analysis = useAppStore((s) => s.analysis)
  const status = useAppStore((s) => s.analysisStatus)
  const hasResults = !!analysis || status === 'running'
  // A new result reopens the results drawer.
  useEffect(() => {
    if (analysis) setRightOpen(true)
  }, [analysis])
  const rightShown = rightOpen && hasResults
  // Results can be widened; the column width and the charts' right edge animate together.
  const [wide, setWide] = useState(false)
  const rightWidth = wide && hasResults ? '36rem' : '24rem'
  return (
    <>
      <header className="absolute left-3 top-3 flex items-center gap-3">
        <h1 className="glass pointer-events-auto px-3 py-1.5 text-base font-semibold">Trend Detective</h1>
        <DataSourcesDialog />
        <AskAiButton open={aiOpen} onClick={() => setAiOpen((x) => !x)} />
        <RegionChip />
      </header>
      <SyntheticWatermark className="absolute left-1/2 top-3 -translate-x-1/2" />
      {/* Left drawer first in DOM order, so Tab goes inputs -> right column -> scroller -> charts. */}
      <div
        inert={!leftOpen}
        className={cn('absolute bottom-3 left-3 top-16 flex flex-col', SLIDE, !leftOpen && '-translate-x-[calc(100%+1rem)]')}
      >
        <LeftDrawer className="max-h-full" onCollapse={() => setLeftOpen(false)} />
      </div>
      <ReopenTab side="left" label="Show analysis inputs" show={!leftOpen} onClick={() => setLeftOpen(true)} />
      <AiSummaryOffer
        aiOpen={aiOpen}
        onAccept={() => {
          useAppStore.getState().setAiRequest(SUMMARY_REQUEST)
          setAiOpen(true)
        }}
        className="absolute left-1/2 top-24 z-30 -translate-x-1/2"
      />
      {/* AI assistant: a floating pop-up under the Ask AI button; the results stay visible on the right. */}
      <AssistantPanel open={aiOpen} onClose={() => setAiOpen(false)} className="absolute left-3 top-16 z-30 h-[min(42rem,calc(100dvh-5.5rem))] w-[27rem] max-w-[calc(100vw-1.5rem)] origin-top-left" />

      <div
        className="absolute bottom-3 right-3 top-3 flex max-w-[calc(100vw-1.5rem)] flex-col items-end gap-3 transition-[width] duration-300 ease-out motion-reduce:transition-none"
        style={{ width: rightWidth }}
      >
        <div className="pointer-events-auto shrink-0">
          <GlobeControls />
        </div>
        <div
          inert={!rightOpen}
          className={cn('flex min-h-0 w-full flex-1 flex-col items-end gap-3', SLIDE, !rightOpen && 'translate-x-[calc(100%+1rem)]')}
        >
          <RightDrawer className="min-h-0" onCollapse={() => setRightOpen(false)} wide={wide} onToggleWide={() => setWide((w) => !w)} />
        </div>
        {/* Map options stay on screen when the results drawer is closed. */}
        <div className="shrink-0">
          <MapPanel />
        </div>
      </div>
      <ReopenTab side="right" label="Show results" show={!rightOpen} onClick={() => setRightOpen(true)} />

      <div
        className="absolute bottom-3 flex flex-col items-center gap-2 transition-[left,right] duration-300 ease-out motion-reduce:transition-none"
        style={{ left: leftOpen ? '22rem' : '4rem', right: rightShown ? `calc(${rightWidth} + 2rem)` : '10rem' }}
      >
        <div className="flex w-full max-w-[760px] justify-center [&>*]:w-full!">
          <TimeScroller />
        </div>
        <ChartDrawer className="max-w-[1100px]" />
      </div>
    </>
  )
}

type Sheet = 'inputs' | 'results' | 'charts' | 'map' | null

function PhoneOverlay() {
  const [sheet, setSheet] = useState<Sheet>('inputs')
  const [aiOpen, setAiOpen] = useState(false)
  const analysis = useAppStore((s) => s.analysis)
  const hasTimeline = useActiveMode() != null
  // A new result opens the results sheet.
  useEffect(() => {
    if (analysis) setSheet('results')
  }, [analysis])

  const tabs: { id: Exclude<Sheet, null>; label: string; disabled?: boolean }[] = [
    { id: 'inputs', label: 'Analyse' },
    { id: 'results', label: 'Results', disabled: !analysis },
    { id: 'charts', label: 'Charts', disabled: !analysis },
    { id: 'map', label: 'Map' },
  ]

  return (
    <>
      <header className="absolute inset-x-2 top-[max(0.5rem,env(safe-area-inset-top))] flex items-center gap-2">
        <h1 className="glass pointer-events-auto shrink-0 px-3 py-1.5 text-sm font-semibold">Trend Detective</h1>
        <DataSourcesDialog compact />
        <AskAiButton compact open={aiOpen} onClick={() => setAiOpen((x) => !x)} />
      </header>
      <div className="pointer-events-auto absolute right-2 top-[calc(max(0.5rem,env(safe-area-inset-top))+2.75rem)]">
        <GlobeControls />
      </div>
      <SyntheticWatermark className="absolute left-2 top-[calc(max(0.5rem,env(safe-area-inset-top))+2.75rem)] origin-top-left scale-75" />

      <div className="absolute inset-x-2 bottom-[calc(3.75rem+env(safe-area-inset-bottom))] flex max-h-[60dvh] flex-col gap-2">
        {sheet === 'inputs' && <LeftDrawer className="max-h-[60dvh] w-full" />}
        {sheet === 'results' && <RightDrawer className="max-h-[60dvh] w-full max-w-none" />}
        {sheet === 'charts' && <ChartDrawer className="max-h-[60dvh] overflow-y-auto" />}
        {sheet === 'map' && (
          <div className="flex max-h-[60dvh] flex-col items-stretch gap-2 overflow-y-auto">
            <MapPanel />
          </div>
        )}
        {sheet === null && (
          <div className="pointer-events-auto mx-auto w-full overflow-x-auto">
            <TimeScroller />
          </div>
        )}
      </div>

      <AiSummaryOffer
        aiOpen={aiOpen}
        onAccept={() => {
          useAppStore.getState().setAiRequest(SUMMARY_REQUEST)
          setAiOpen(true)
        }}
        className="absolute inset-x-2 top-[calc(max(0.5rem,env(safe-area-inset-top))+5.5rem)] z-30 text-xs"
      />
      <AssistantPanel
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        className="absolute inset-x-2 top-[calc(max(0.5rem,env(safe-area-inset-top))+2.75rem)] bottom-[calc(3.75rem+env(safe-area-inset-bottom))] z-20"
      />
      <nav
        aria-label="Panels"
        className="glass-strong pointer-events-auto absolute inset-x-2 bottom-[max(0.5rem,env(safe-area-inset-bottom))] flex gap-1 p-1"
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            disabled={t.disabled}
            aria-pressed={sheet === t.id}
            onClick={() => setSheet((s) => (s === t.id ? null : t.id))}
            className={cn(
              'h-11 flex-1 rounded-xl text-sm font-medium text-white disabled:opacity-40',
              sheet === t.id ? 'bg-sky-300 text-slate-950' : 'hover:bg-white/10',
            )}
          >
            {t.label}
          </button>
        ))}
        <button
          type="button"
          disabled={!hasTimeline}
          title={hasTimeline ? undefined : 'No map layer to scrub for this variable'}
          aria-pressed={sheet === null}
          onClick={() => setSheet(null)}
          className={cn('h-11 flex-1 rounded-xl text-sm font-medium text-white disabled:opacity-40', sheet === null ? 'bg-sky-300 text-slate-950' : 'hover:bg-white/10')}
        >
          Time
        </button>
      </nav>
    </>
  )
}
