// M6 layout: full-screen globe with glass panels on top (glass-ui skill).
// Desktop: left drawer (inputs), right column (map layer button, poles and zoom in one row at the top,
// then full-height results, then the map legend), bottom-centre time scroller and charts.
// Phone (<768 px): one bottom sheet at a time, chosen from a tab bar.
// The overlay root passes pointer events through; only the panels capture them.
import { useEffect, useState } from 'react'
import ChartDrawer from '@/charts/ChartDrawer'
import TimeScroller from '@/components/TimeScroller'
import { Globe, GlobeControls, MapLegend, MapModeMenu, PoleToggle, useActiveMode, ZoomControls } from '@/globe'
import { usePhone } from '@/lib/useMedia'
import LeftDrawer from '@/panels/LeftDrawer'
import AssistantPanel from '@/assistant/AssistantPanel'
import DataSourcesDialog from '@/panels/DataSourcesDialog'
import ImportDataDialog from '@/panels/ImportDataDialog'
import MapPanel from '@/panels/MapPanel'
import RightDrawer from '@/panels/RightDrawer'
import { useAppStore } from '@/state/store'
import { cn } from 'cn'

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
        // Both sit just below the top row (the right one under the map/pole/zoom row).
        'glass-strong pointer-events-auto absolute top-16 z-10 h-10 px-2.5 text-base font-semibold text-white transition-opacity duration-300 hover:bg-white/10 motion-reduce:transition-none',
        side === 'left' ? 'left-3' : 'right-3',
        show ? 'opacity-100' : 'pointer-events-none opacity-0',
      )}
    >
      {side === 'left' ? '»' : '«'}
    </button>
  )
}

const SUMMARY_REQUEST =
  'Summarise the result now shown in the app for a non-expert: what was tested, the verdict, the trend with its 95% interval, the p-value, the dataset, and one caveat.'

/**
 * After a manual Run analysis the "Ask AI" button glows (boss, 2026-11-14; replaces the summary banner).
 * Clicking it while it glows opens the assistant and asks for a plain-language summary of the result.
 */
function useAskAi() {
  const [aiOpen, setAiOpen] = useState(false)
  const analysis = useAppStore((s) => s.analysis)
  const lastRunBy = useAppStore((s) => s.lastRunBy)
  const [glow, setGlow] = useState(false)
  useEffect(() => {
    setGlow(!!analysis && lastRunBy === 'button' && !aiOpen)
  }, [analysis]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (aiOpen) setGlow(false)
  }, [aiOpen])
  const onAskAi = () => {
    if (glow) {
      useAppStore.getState().setAiRequest(SUMMARY_REQUEST)
      setAiOpen(true)
    } else setAiOpen((x) => !x)
  }
  return { aiOpen, setAiOpen, glow, onAskAi }
}

/** Header button that opens the AI assistant (the app's only online feature). */
function AskAiButton({ open, glow, onClick, compact = false }: { open: boolean; glow: boolean; onClick: () => void; compact?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={open}
      onClick={onClick}
      title={glow ? 'Get a plain-language AI summary of this result' : undefined}
      aria-label={glow ? 'Ask AI for a plain-language summary of this result' : undefined}
      className={cn(
        'glass pointer-events-auto flex items-center gap-1.5 font-medium text-white hover:bg-white/10',
        compact ? 'px-2.5 py-1.5 text-xs' : 'px-3 py-1.5 text-sm',
        open && 'ring-2 ring-sky-300/70',
        glow && 'ai-glow text-sky-100',
      )}
    >
      <span aria-hidden>✦</span>
      Ask AI
    </button>
  )
}

// Drawer widths (rem) and the least room the charts need between them. Opening or widening one drawer
// narrows or closes the other when the charts would be squeezed below this width.
const REM = 16
const LEFT_REM = { narrow: 22, wide: 32 }
const RIGHT_REM = { narrow: 24, wide: 36 }
const MIN_CHART_PX = 620
const chartsFit = (leftRem: number, rightRem: number) => window.innerWidth - (leftRem + rightRem + 4) * REM >= MIN_CHART_PX

function DesktopOverlay() {
  // Side drawers run full height and slide out sideways; the scroller and chart drawer sit between
  // them and widen (animated) when a drawer is closed.
  const [leftOpen, setLeftOpen] = useState(true)
  // The inputs drawer can be widened too (boss, 2026-11-13); the charts' left edge follows it.
  const [leftWide, setLeftWide] = useState(false)
  const leftRem = leftWide ? LEFT_REM.wide : LEFT_REM.narrow
  const leftWidth = `${leftRem}rem`
  const { aiOpen, setAiOpen, glow, onAskAi } = useAskAi()
  const [rightOpen, setRightOpen] = useState(true)
  const analysis = useAppStore((s) => s.analysis)
  const lastRunBy = useAppStore((s) => s.lastRunBy)
  const status = useAppStore((s) => s.analysisStatus)
  const hasResults = !!analysis || status === 'running'
  // A new result reopens the results drawer; after Run analysis the inputs fold away so the charts
  // get the room (boss, 2026-11-14). The » tab brings them back.
  useEffect(() => {
    if (!analysis) return
    setRightOpen(true)
    if (lastRunBy === 'button') setLeftOpen(false)
  }, [analysis]) // eslint-disable-line react-hooks/exhaustive-deps
  const rightShown = rightOpen && hasResults
  // Results can be widened; the column width and the charts' right edge animate together.
  const [wide, setWide] = useState(false)
  const rightRem = wide && hasResults ? RIGHT_REM.wide : RIGHT_REM.narrow
  const rightWidth = `${rightRem}rem`

  // Map legend: folds away when a result arrives so the results get the full height; reopened from the map menu.
  const [legendOpen, setLegendOpen] = useState(true)
  useEffect(() => {
    if (analysis) setLegendOpen(false)
  }, [analysis])

  const openLeft = () => {
    setLeftOpen(true)
    if (rightShown && !chartsFit(leftRem, rightRem)) setWide(false)
  }
  const toggleLeftWide = () => {
    const next = !leftWide
    setLeftWide(next)
    if (next && rightShown && !chartsFit(LEFT_REM.wide, rightRem)) setWide(false)
  }
  const toggleRightWide = () => {
    const next = !wide
    setWide(next)
    if (next && leftOpen && !chartsFit(leftRem, RIGHT_REM.wide)) setLeftOpen(false)
  }

  return (
    <>
      <header className="absolute left-3 top-3 flex items-center gap-3">
        <h1 className="glass pointer-events-auto px-3 py-1.5 text-base font-semibold">ImpactLens</h1>
        <DataSourcesDialog />
        <AskAiButton open={aiOpen} glow={glow} onClick={onAskAi} />
        <ImportDataDialog />
      </header>
      {/* Left drawer first in DOM order, so Tab goes inputs -> right column -> scroller -> charts. */}
      <div
        inert={!leftOpen}
        className={cn(
          'absolute bottom-3 left-3 top-16 flex max-w-[calc(100vw-1.5rem)] flex-col transition-[transform,width] duration-300 ease-out motion-reduce:transition-none',
          !leftOpen && '-translate-x-[calc(100%+1rem)]',
        )}
        style={{ width: leftWidth }}
      >
        <LeftDrawer className="h-full min-h-0 w-full" onCollapse={() => setLeftOpen(false)} wide={leftWide} onToggleWide={toggleLeftWide} />
      </div>
      <ReopenTab side="left" label="Show analysis inputs" show={!leftOpen} onClick={openLeft} />
      {/* AI assistant: a floating pop-up under the Ask AI button; the results stay visible on the right. */}
      <AssistantPanel open={aiOpen} onClose={() => setAiOpen(false)} className="absolute left-3 top-16 z-30 h-[min(42rem,calc(100dvh-5.5rem))] w-[27rem] max-w-[calc(100vw-1.5rem)] origin-top-left" />

      <div
        className="absolute bottom-3 right-3 top-3 flex max-w-[calc(100vw-1.5rem)] flex-col items-end gap-3 transition-[width] duration-300 ease-out motion-reduce:transition-none"
        style={{ width: rightWidth }}
      >
        {/* Top-right corner: one map layer button (layers open on hover), poles, zoom. */}
        <div className="relative z-40 flex shrink-0 items-center gap-2">
          <MapModeMenu legendOpen={legendOpen} onToggleLegend={() => setLegendOpen((o) => !o)} />
          <div className="pointer-events-auto">
            <PoleToggle />
          </div>
          <div className="pointer-events-auto">
            <ZoomControls horizontal />
          </div>
        </div>
        <div
          inert={!rightOpen}
          className={cn('flex min-h-0 w-full flex-1 flex-col items-end gap-3', SLIDE, !rightOpen && 'translate-x-[calc(100%+1rem)]')}
        >
          <RightDrawer className="min-h-0 flex-1" onCollapse={() => setRightOpen(false)} wide={wide} onToggleWide={toggleRightWide} />
        </div>
        {legendOpen && (
          <div className="pointer-events-auto shrink-0 animate-in fade-in slide-in-from-bottom-2 duration-150 motion-reduce:animate-none">
            <MapLegend />
          </div>
        )}
      </div>
      <ReopenTab side="right" label="Show results" show={!rightOpen} onClick={() => setRightOpen(true)} />

      <div
        className="absolute bottom-3 flex flex-col items-center gap-2 transition-[left,right] duration-300 ease-out motion-reduce:transition-none"
        style={{ left: leftOpen ? `calc(${leftWidth} + 2rem)` : '4rem', right: rightShown ? `calc(${rightWidth} + 2rem)` : legendOpen ? '20rem' : '4rem' }}
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
  const { aiOpen, setAiOpen, glow, onAskAi } = useAskAi()
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
        <h1 className="glass pointer-events-auto shrink-0 px-3 py-1.5 text-sm font-semibold">ImpactLens</h1>
        <DataSourcesDialog compact />
        <AskAiButton compact open={aiOpen} glow={glow} onClick={onAskAi} />
        <ImportDataDialog compact />
      </header>
      <div className="pointer-events-auto absolute right-2 top-[calc(max(0.5rem,env(safe-area-inset-top))+2.75rem)]">
        <GlobeControls />
      </div>

      <div className="absolute inset-x-2 bottom-[calc(3.75rem+env(safe-area-inset-bottom))] flex max-h-[60dvh] flex-col gap-2">
        {sheet === 'inputs' && <LeftDrawer className="h-[60dvh] max-h-[60dvh] w-full" />}
        {sheet === 'results' && <RightDrawer className="max-h-[60dvh] w-full max-w-none" />}
        {sheet === 'charts' && <ChartDrawer className="no-scrollbar max-h-[60dvh] overflow-y-auto" />}
        {sheet === 'map' && (
          <div className="no-scrollbar flex max-h-[60dvh] flex-col items-stretch gap-2 overflow-y-auto">
            <MapPanel />
          </div>
        )}
        {sheet === null && (
          <div className="pointer-events-auto mx-auto w-full overflow-x-auto">
            <TimeScroller />
          </div>
        )}
      </div>

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
