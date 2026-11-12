// Time scroller (bottom centre): scrubs the active map mode's timeline. Custom control on
// pointer events with a canvas strip that draws the no-data spans (plan section 7).
//
// - The store's `frameIndex` indexes the active mode's timeline (globe/mapModes: frames plus
//   missing dates, or the outline variable's record). The globe reacts with uniform /
//   visibility changes only, so scrubbing never uploads a texture.
// - The strip spans the active timeline, widened to the selected variable's record when that
//   variable is the one the mode shows (e.g. ice mass 1972 onward vs GRACE maps from 2002).
//   Time with no map data is hatched; the thumb stays on the layer's own steps.
// - Keyboard on the slider: Left/Right (Up/Down) step, Shift+arrow or PageUp/PageDown step a
//   year, Home/End, Space plays or pauses.
// - Playback steps `frameIndex` with requestAnimationFrame at `stepsPerSecond` and stops at the
//   end. Playback only starts on request; with reduced motion the thumb does not glide.
// - Renders nothing when no time-based map mode is active.
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Pause, Play } from 'lucide-react'
import { cn } from 'cn'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/state/store'
import { dateSpan, formatDate, modeLabel, modeShowsVariable, useActiveMode, useVariables } from '@/globe'
import { BAR_HEIGHT, BAR_TOP, drawStrip, STRIP_COLORS } from './TimeScrollerCanvas'
import { buildScrollerModel, indexAtFraction, stepByYear, stepFraction } from './TimeScrollerModel'

const STRIP_HEIGHT = 36 // CSS px: bar + ticks + labels

export interface TimeScrollerProps {
  className?: string
  /** Playback speed for monthly timelines (steps per second). */
  monthlyStepsPerSecond?: number
  /** Playback speed for annual timelines (steps per second). */
  annualStepsPerSecond?: number
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const on = () => setReduced(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return reduced
}

export default function TimeScroller({ className, monthlyStepsPerSecond = 8, annualStepsPerSecond = 2 }: TimeScrollerProps) {
  const active = useActiveMode()
  const variables = useVariables()
  const variableId = useAppStore((s) => s.variable)
  const region = useAppStore((s) => s.region)
  const playing = useAppStore((s) => s.playing)
  const setPlaying = useAppStore((s) => s.setPlaying)
  const setFrameIndex = useAppStore((s) => s.setFrameIndex)
  const reducedMotion = usePrefersReducedMotion()

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stripRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [dragging, setDragging] = useState(false)

  // The selected variable's record widens the strip when the mode shows that variable.
  const variable = variableId ? (variables?.find((v) => v.id === variableId) ?? null) : null
  const extraKey = (() => {
    if (!active || !variable || !modeShowsVariable(active.mode, variable)) return null
    const p = (region && variable.periods[region]) || variable.period
    return `${dateSpan(p[0])[0]}:${dateSpan(p[1])[1]}`
  })()
  const steps = active?.steps ?? null
  const model = useMemo(() => {
    if (!steps) return null
    const extra = extraKey ? (extraKey.split(':').map(Number) as [number, number]) : null
    return buildScrollerModel(steps, extra)
  }, [steps, extraKey])

  const n = steps?.length ?? 0
  const modeId = active?.mode.id ?? null

  // Stop playback when the mode changes or disappears.
  useEffect(() => {
    if (useAppStore.getState().playing) setPlaying(false)
  }, [modeId, setPlaying])

  // Canvas size follows the strip's width.
  useEffect(() => {
    const el = stripRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => setWidth(Math.round(entries[0].contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [modeId])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !model || width <= 0) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(STRIP_HEIGHT * dpr)
    drawStrip(canvas, model, width, STRIP_HEIGHT, dpr)
  }, [model, width])

  // Playback: one step per 1/rate seconds on requestAnimationFrame; stops at the end.
  const rate = model?.annual ? annualStepsPerSecond : monthlyStepsPerSecond
  useEffect(() => {
    if (!playing || n === 0) return
    const interval = 1000 / Math.max(rate, 0.1)
    let raf = 0
    let last = performance.now()
    let acc = 0
    const tick = (now: number) => {
      acc += now - last
      last = now
      if (acc >= interval) {
        acc = Math.min(acc - interval, interval) // never burst several steps after a slow frame
        const s = useAppStore.getState()
        const next = Math.min(Math.floor(s.frameIndex) + 1, n - 1)
        if (next !== s.frameIndex) s.setFrameIndex(next)
        if (next >= n - 1) {
          s.setPlaying(false)
          return
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, n, rate])

  const go = useCallback(
    (i: number) => {
      if (n === 0) return
      setPlaying(false)
      setFrameIndex(Math.min(Math.max(i, 0), n - 1))
    },
    [n, setFrameIndex, setPlaying],
  )

  const togglePlay = useCallback(() => {
    const s = useAppStore.getState()
    if (s.playing) return s.setPlaying(false)
    if (n === 0) return
    if (Math.floor(s.frameIndex) >= n - 1) s.setFrameIndex(0) // at the end: play from the start
    s.setPlaying(true)
  }, [n])

  if (!active || !model) return null

  const { index, step, mode } = active
  const label = modeLabel(variables, mode, active.manifest)
  const noData = !step.hasData
  const valueText = `${formatDate(step.date, true)}${noData ? ', no data' : ''}`
  const thumbPct = stepFraction(model, index) * 100
  const annual = model.annual
  const hasOutside = model.spans.some((s) => s.outside)

  const fractionAt = (clientX: number) => {
    const rect = stripRef.current?.getBoundingClientRect()
    return rect && rect.width > 0 ? (clientX - rect.left) / rect.width : 0
  }
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    e.currentTarget.focus()
    setDragging(true)
    go(indexAtFraction(model, fractionAt(e.clientX)))
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging) return
    const i = indexAtFraction(model, fractionAt(e.clientX))
    if (i !== index) go(i)
  }
  const endDrag = (e: PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    setDragging(false)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const year = (dir: 1 | -1) => go(stepByYear(model, index, dir))
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowUp':
        if (e.shiftKey) year(1)
        else go(index + 1)
        break
      case 'ArrowLeft':
      case 'ArrowDown':
        if (e.shiftKey) year(-1)
        else go(index - 1)
        break
      case 'PageUp':
        year(1)
        break
      case 'PageDown':
        year(-1)
        break
      case 'Home':
        go(0)
        break
      case 'End':
        go(n - 1)
        break
      case ' ':
      case 'Spacebar':
        togglePlay()
        break
      default:
        return
    }
    e.preventDefault()
  }

  const btn = 'text-white hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-ring'
  const atStart = index <= 0
  const atEnd = index >= n - 1

  return (
    <section
      aria-label="Time scroller"
      data-testid="time-scroller"
      className={cn('glass-strong flex w-[min(760px,calc(100vw-24px))] flex-col gap-1 px-3 pb-2 pt-2 text-sm', className)}
    >
      <div className="flex items-center justify-between gap-3 text-xs">
        <p className="m-0 min-w-0 truncate text-white/90">
          <span className="font-semibold text-white">{label}</span>
          <span aria-hidden> · </span>
          <time dateTime={step.date} className="tabular-nums text-white">
            {formatDate(step.date, true)}
          </time>
          {noData && (
            <span className="ml-2 rounded-md border border-amber-300/70 px-1.5 py-px text-amber-200">no data</span>
          )}
        </p>
        <p className="m-0 flex shrink-0 items-center gap-3 text-white/85" aria-hidden>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-4 rounded-sm" style={{ background: STRIP_COLORS.data }} />
            Data
          </span>
          <span className="flex items-center gap-1">
            <span
              className="inline-block h-2.5 w-4 rounded-sm"
              style={{
                background: `repeating-linear-gradient(135deg, ${STRIP_COLORS.noDataHatch} 0 1.5px, ${STRIP_COLORS.noDataFill} 1.5px 4px)`,
              }}
            />
            {hasOutside ? 'No map data' : 'No data'}
          </span>
        </p>
      </div>

      <div className="flex items-center gap-2">
        <div role="group" aria-label="Playback" className="flex shrink-0 items-center gap-0.5">
          <Button size="icon-sm" variant="ghost" className={btn} aria-label="Back one year" title="Back one year (Shift+Left)" disabled={atStart} onClick={() => go(stepByYear(model, index, -1))}>
            <ChevronsLeft aria-hidden />
          </Button>
          {!annual && (
            <Button size="icon-sm" variant="ghost" className={btn} aria-label="Back one month" title="Back one month (Left)" disabled={atStart} onClick={() => go(index - 1)}>
              <ChevronLeft aria-hidden />
            </Button>
          )}
          <Button
            size="icon-sm"
            variant="secondary"
            className={cn(btn, 'bg-white/15')}
            aria-label={playing ? 'Pause' : 'Play'}
            title={playing ? 'Pause (Space)' : 'Play (Space)'}
            onClick={togglePlay}
          >
            {playing ? <Pause aria-hidden /> : <Play aria-hidden />}
          </Button>
          {!annual && (
            <Button size="icon-sm" variant="ghost" className={btn} aria-label="Forward one month" title="Forward one month (Right)" disabled={atEnd} onClick={() => go(index + 1)}>
              <ChevronRight aria-hidden />
            </Button>
          )}
          <Button size="icon-sm" variant="ghost" className={btn} aria-label="Forward one year" title="Forward one year (Shift+Right)" disabled={atEnd} onClick={() => go(stepByYear(model, index, 1))}>
            <ChevronsRight aria-hidden />
          </Button>
        </div>

        <div
          ref={stripRef}
          role="slider"
          tabIndex={0}
          aria-label={`${label}, time`}
          aria-valuemin={0}
          aria-valuemax={n - 1}
          aria-valuenow={index}
          aria-valuetext={valueText}
          aria-keyshortcuts="ArrowLeft ArrowRight Shift+ArrowLeft Shift+ArrowRight PageUp PageDown Home End Space"
          data-testid="time-scroller-slider"
          onKeyDown={onKeyDown}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className="relative min-w-0 flex-1 cursor-pointer touch-none select-none rounded-md outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          style={{ height: STRIP_HEIGHT }}
        >
          <canvas ref={canvasRef} aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" />
          <div
            aria-hidden
            data-testid="time-scroller-thumb"
            className={cn(
              'pointer-events-none absolute -translate-x-1/2',
              !reducedMotion && !dragging && 'transition-[left] duration-100 ease-linear',
            )}
            style={{ left: `${thumbPct}%`, top: BAR_TOP - 4, height: BAR_HEIGHT + 8 }}
          >
            <div className="mx-auto h-full w-[3px] rounded-full bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.6)]" />
            <div
              className={cn(
                'absolute left-1/2 top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.6)]',
                noData ? 'bg-amber-400' : 'bg-sky-500',
              )}
            />
          </div>
        </div>
      </div>
    </section>
  )
}
