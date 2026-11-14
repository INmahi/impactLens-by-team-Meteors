// Left drawer: the analysis inputs (plan section 4). Compare switch, then steps Variable, Region,
// (Compare with), Time range; Run analysis pinned at the bottom.
// Everything is read from variables.json / regions.json: no variable or region id is hard-coded.
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { Region, Variable } from '@trend/contract'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import DescribeDialog from '@/panels/DescribeDialog'
import { mapModeForVariable, mapModes } from '@/globe'
import { runAnalysisFromStore } from '@/lib/runAnalysis'
import { dateSteps, formatStep, spanYears, useRegionsData, useVariablesData } from '@/lib/useData'
import { useAppStore } from '@/state/store'
import { cn } from 'cn'

/** Below this many years a real trend can easily be missed (stats engine flags lowPower). */
const SHORT_RECORD_YEARS = 30

/** Picker headings per region kind (contract vocabulary, not region ids). */
const KIND_LABEL: Record<string, string> = {
  ice_sheet: 'Ice sheets',
  ice_sheet_basin: 'Ice sheet basins',
  glacier_region: 'Glacier regions',
  coastal_sea: 'Coastal seas',
  country: 'Countries',
  division: 'Divisions of Bangladesh',
  district: 'Districts of Bangladesh',
  global: 'Global',
}
const KIND_ORDER = ['global', 'country', 'division', 'district', 'ice_sheet', 'ice_sheet_basin', 'glacier_region', 'coastal_sea']

/** Group headings for variables that share `group` (contract `group` ids). */
function groupLabel(group: string): string {
  return group.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
}

// Guided steps (boss, 2026-11-13): a Compare mode switch on top, then collapsible steps
// Variable -> Region -> (Compare with) -> Time range. Choosing in a step folds it and opens the next;
// any step can be reopened. While a Region step is open, clicking a region on the globe selects it.
type StepId = 'variable' | 'region' | 'compare' | 'time'

export default function LeftDrawer({
  className,
  onCollapse,
  wide,
  onToggleWide,
}: {
  className?: string
  onCollapse?: () => void
  wide?: boolean
  onToggleWide?: () => void
}) {
  const { data: variables } = useVariablesData()
  const { data: regions } = useRegionsData()

  return (
    <section aria-label="Analysis inputs" className={cn('glass-sidebar flex w-[22rem] max-w-full flex-col overflow-hidden', className)}>
      <header className="flex items-center justify-between gap-2 px-4 pt-3 pb-2">
        <h2 className="text-sm font-semibold tracking-wide text-white">Analyse a trend</h2>
        <span className="flex items-center gap-1">
          {onToggleWide && (
            <button
              type="button"
              onClick={onToggleWide}
              aria-pressed={!!wide}
              aria-label={wide ? 'Make analysis inputs narrower' : 'Make analysis inputs wider'}
              title={wide ? 'Narrower' : 'Wider'}
              className="rounded-md px-2 py-0.5 text-base font-semibold text-white/90 hover:bg-white/10"
            >
              {wide ? '⇤' : '⇥'}
            </button>
          )}
          {onCollapse && (
            <button
              type="button"
              onClick={onCollapse}
              aria-label="Hide analysis inputs"
              title="Hide analysis inputs"
              className="rounded-md px-2 py-0.5 text-base font-semibold text-white/90 hover:bg-white/10"
            >
              «
            </button>
          )}
        </span>
      </header>
      {!variables || !regions ? (
        <p className="px-4 pb-4 text-sm text-white/90">Loading…</p>
      ) : (
        <Inputs variables={variables} regions={regions} />
      )}
    </section>
  )
}

function Inputs({ variables, regions }: { variables: Variable[]; regions: Region[] }) {
  const variableId = useAppStore((s) => s.variable)
  const regionId = useAppStore((s) => s.region)
  const compareMode = useAppStore((s) => s.compareMode)
  const compareRegion = useAppStore((s) => s.compareRegion)
  const compareVariables = useAppStore((s) => s.compareVariables)
  const rangeStart = useAppStore((s) => s.rangeStart)
  const rangeEnd = useAppStore((s) => s.rangeEnd)
  const globePickSeq = useAppStore((s) => s.globePickSeq)
  const setVariable = useAppStore((s) => s.setVariable)
  const setRegion = useAppStore((s) => s.setRegion)
  const setMapLayer = useAppStore((s) => s.setMapLayer)
  const setCompareMode = useAppStore((s) => s.setCompareMode)
  const setCompareRegion = useAppStore((s) => s.setCompareRegion)
  const setPickTarget = useAppStore((s) => s.setPickTarget)

  const [open, setOpen] = useState<Set<StepId>>(() => new Set<StepId>(['variable', 'time']))
  const toggle = (id: StepId) =>
    setOpen((o) => {
      const n = new Set(o)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  const advance = (close: StepId, next?: StepId) =>
    setOpen((o) => {
      const n = new Set(o)
      n.delete(close)
      if (next) n.add(next)
      return n
    })

  const variable = variables.find((v) => v.id === variableId) ?? null
  const region = regions.find((r) => r.id === regionId) ?? null
  const modes = useMemo(() => mapModes(variables), [variables])
  const comparing = compareMode !== 'none'
  const validRegions = variable ? regions.filter((r) => variable.regions.includes(r.id)) : []
  const otherRegions = validRegions.filter((r) => r.id !== regionId)
  const otherVariables = variable && regionId ? variables.filter((v) => v.id !== variable.id && v.regions.includes(regionId)) : []
  const hasRecord = !!(variable && regionId && variable.periods[regionId])

  function chooseVariable(v: Variable) {
    setVariable(v.id)
    // Show the variable's own map if it has one; otherwise the globe hides layers (sea level).
    setMapLayer(mapModeForVariable(modes, v))
    // Keep the region if it is valid for the new variable; otherwise pick its first region.
    if (!regionId || !v.regions.includes(regionId)) setRegion(v.regions[0] ?? null)
    advance('variable', 'region')
  }
  function chooseRegion(id: string) {
    setRegion(id)
    if (compareRegion === id) setCompareRegion(null)
    advance('region', comparing ? 'compare' : undefined)
  }
  function setComparing(on: boolean) {
    if (!on) {
      setCompareMode('none')
      advance('compare')
      return
    }
    setCompareMode(otherRegions.length ? 'regions' : 'variables')
    if (hasRecord) setOpen((o) => new Set(o).add('compare'))
  }

  // Globe clicks fill whichever Region step is open (the store checks the region is valid there).
  const regionOpen = open.has('region') && !!variable
  const compareRegionOpen = !regionOpen && open.has('compare') && compareMode === 'regions' && hasRecord
  const pickKey = regionOpen ? `r:${variable!.regions.join()}` : compareRegionOpen ? `c:${otherRegions.map((r) => r.id).join()}` : ''
  useEffect(() => {
    if (regionOpen) setPickTarget('region', variable!.regions)
    else if (compareRegionOpen) setPickTarget('compareRegion', otherRegions.map((r) => r.id))
    else setPickTarget(null, [])
  }, [pickKey]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => setPickTarget(null, []), [setPickTarget])
  // An accepted globe pick moves on, like a click in the list.
  const firstSeq = useRef(globePickSeq)
  useEffect(() => {
    if (globePickSeq === firstSeq.current) return
    if (regionOpen) advance('region', comparing ? 'compare' : undefined)
    else if (compareRegionOpen) advance('compare')
  }, [globePickSeq]) // eslint-disable-line react-hooks/exhaustive-deps

  // Step summaries shown when a step is folded.
  let timeSummary: string | null = null
  if (hasRecord) {
    const [a, b] = variable!.periods[regionId!]
    const s = rangeStart ?? a
    const e = rangeEnd ?? b
    const y = spanYears(s, e)
    timeSummary = `${formatStep(s)} – ${formatStep(e)} (${y.toFixed(y < 10 ? 1 : 0)} yr)`
  }
  const compareSummary =
    compareMode === 'regions'
      ? compareRegion
        ? `vs ${regions.find((r) => r.id === compareRegion)?.name ?? compareRegion}`
        : 'Choose a second region'
      : compareVariables.length
        ? `+ ${compareVariables.map((id) => variables.find((v) => v.id === id)?.name ?? id).join(', ')}`
        : 'Choose variables to add'
  const blocked = !hasRecord
    ? 'Choose a variable and a region first.'
    : compareMode === 'regions' && !compareRegion
      ? 'Choose a second region to compare with.'
      : compareMode === 'variables' && compareVariables.length === 0
        ? 'Add at least one variable to compare.'
        : null

  let n = 0
  return (
    <>
      <div className="shrink-0 px-4 pb-2">
        <button
          type="button"
          role="switch"
          aria-checked={comparing}
          disabled={!variable}
          title={variable ? undefined : 'Choose a variable first'}
          onClick={() => setComparing(!comparing)}
          className={cn(
            'flex w-full items-center justify-between rounded-xl border px-3 py-2 text-sm font-medium text-white disabled:opacity-50',
            comparing ? 'border-amber-300/70 bg-amber-300/15' : 'border-white/15 bg-white/[0.04] hover:bg-white/10',
          )}
        >
          <span>Compare mode</span>
          <span className="flex items-center gap-2 text-xs">
            {comparing ? 'On' : 'Off'}
            <span aria-hidden className={cn('relative h-5 w-9 rounded-full transition-colors', comparing ? 'bg-amber-300' : 'bg-white/25')}>
              <span
                className={cn(
                  'absolute top-0.5 left-0 size-4 rounded-full bg-white shadow transition-transform duration-200 motion-reduce:transition-none',
                  comparing ? 'translate-x-[18px]' : 'translate-x-0.5',
                )}
              />
            </span>
          </span>
        </button>
      </div>

      <div className="no-scrollbar flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain px-4 pb-3">
        <Step n={++n} title="Variable" summary={variable?.name} done={!!variable} open={open.has('variable')} onToggle={() => toggle('variable')}>
          <VariablePicker variables={variables} selected={variableId} onSelect={chooseVariable} />
        </Step>

        <Step
          n={++n}
          title={compareMode === 'regions' ? 'First region' : 'Region'}
          summary={region?.name}
          done={!!region}
          disabled={!variable}
          open={regionOpen}
          onToggle={() => toggle('region')}
        >
          {variable && <RegionPicker regions={validRegions} selected={regionId} onSelect={chooseRegion} label="Region" />}
        </Step>

        {comparing && (
          <Step
            n={++n}
            title="Compare with"
            summary={compareSummary}
            done={!blocked}
            disabled={!hasRecord}
            open={open.has('compare') && hasRecord}
            onToggle={() => toggle('compare')}
            accent="amber"
          >
            {hasRecord && <ComparePicker otherRegions={otherRegions} otherVariables={otherVariables} onPickedRegion={() => advance('compare')} />}
          </Step>
        )}

        <Step n={++n} title="Time range" summary={timeSummary} done={hasRecord} disabled={!hasRecord} open={open.has('time') && hasRecord} onToggle={() => toggle('time')}>
          {hasRecord && <TimeRange variable={variable!} regionId={regionId!} />}
        </Step>
      </div>

      <div className="mt-auto shrink-0 border-t border-white/10 px-4 pt-3 pb-4">
        {hasRecord ? <RunAnalysis variable={variable!} regionId={regionId!} blocked={blocked} /> : <p className="text-xs text-white/80">{blocked}</p>}
      </div>
    </>
  )
}

/** One collapsible step. The body folds with a grid-rows transition and is inert while closed. */
function Step({
  n,
  title,
  summary,
  done,
  disabled,
  open,
  onToggle,
  accent = 'sky',
  children,
}: {
  n: number
  title: string
  summary?: string | null
  done?: boolean
  disabled?: boolean
  open: boolean
  onToggle: () => void
  accent?: 'sky' | 'amber'
  children: React.ReactNode
}) {
  const bodyId = useId()
  return (
    <div className={cn('shrink-0 rounded-xl border bg-white/[0.03]', open ? (accent === 'amber' ? 'border-amber-300/40' : 'border-sky-300/35') : 'border-white/10')}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        disabled={disabled}
        onClick={onToggle}
        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span
          aria-hidden
          className={cn(
            'grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold',
            done ? (accent === 'amber' ? 'bg-amber-300 text-slate-950' : 'bg-sky-300 text-slate-950') : 'border border-white/40 text-white',
          )}
        >
          {done ? '✓' : n}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-xs font-medium tracking-wide text-white/85 uppercase">
            <span className="sr-only">Step {n}: </span>
            {title}
          </span>
          {!open && summary && <span className="truncate text-sm text-white">{summary}</span>}
        </span>
        <span aria-hidden className={cn('text-white/80 transition-transform duration-300 motion-reduce:transition-none', open && 'rotate-180')}>
          ▾
        </span>
      </button>
      <div
        id={bodyId}
        inert={!open}
        className={cn('grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none', open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="px-3 pt-1 pb-3">{children}</div>
        </div>
      </div>
    </div>
  )
}

// ---------- variable picker ----------

function VariablePicker({
  variables,
  selected,
  onSelect,
}: {
  variables: Variable[]
  selected: string | null
  onSelect: (v: Variable) => void
}) {
  const name = useId()
  // Top-level entries: grouped variables become one card; variants sit under their parent.
  const primary = variables.filter((v) => !v.variantOf)
  const variantsOf = (id: string) => variables.filter((v) => v.variantOf === id)
  const blocks: { key: string; title: string | null; items: Variable[] }[] = []
  for (const v of primary) {
    if (v.group) {
      let block = blocks.find((b) => b.key === `group:${v.group}`)
      if (!block) {
        block = { key: `group:${v.group}`, title: groupLabel(v.group), items: [] }
        blocks.push(block)
      }
      block.items.push(v)
    } else {
      blocks.push({ key: v.id, title: null, items: [v] })
    }
  }

  const option = (v: Variable, sub = false) => (
    <div key={v.id} className={cn('flex items-center gap-1', sub && 'ml-4')}>
    <label
      className={cn(
        'flex flex-1 cursor-pointer items-baseline justify-between gap-2 rounded-lg border px-2 py-1.5 text-sm',
        'has-focus-visible:outline-2 has-focus-visible:outline-offset-1 has-focus-visible:outline-ring',
        selected === v.id ? 'border-sky-300/70 bg-sky-300/15 text-white' : 'border-transparent text-white/90 hover:bg-white/10',
        sub && 'text-[13px]',
      )}
    >
      <span className="flex items-baseline gap-2">
        <input
          type="radio"
          name={name}
          className="sr-only"
          checked={selected === v.id}
          onChange={() => onSelect(v)}
        />
        <span aria-hidden className={cn('size-2 shrink-0 rounded-full border border-white/70', selected === v.id && 'border-sky-300 bg-sky-300')} />
        {sub ? groupLabel(v.name.replace(/^.*?,\s*/, '')) || v.name : v.name}
      </span>
      <span className="shrink-0 text-xs tabular-nums text-white/80">
        {v.period[0].slice(0, 4)}–{v.period[1].slice(0, 4)}
      </span>
    </label>
    <DescribeDialog variable={v} />
    </div>
  )

  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="mb-1 text-xs font-medium tracking-wide text-white/85 uppercase">Variable</legend>
      {blocks.map((b) => (
        <div key={b.key} className={cn('flex flex-col gap-0.5', b.title && 'rounded-xl border border-white/10 p-1')}>
          {b.title && <p className="px-2 pt-0.5 text-xs font-medium text-white/85">{b.title}</p>}
          {b.items.map((v) => (
            <div key={v.id} className="flex flex-col gap-0.5">
              {option(v)}
              {variantsOf(v.id).map((sub) => option(sub, true))}
            </div>
          ))}
        </div>
      ))}
    </fieldset>
  )
}

// ---------- region picker (with search; globe clicks also select while open) ----------

function RegionPicker({
  regions,
  selected,
  onSelect,
  label,
  accent = 'sky',
}: {
  regions: Region[]
  selected: string | null
  onSelect: (id: string) => void
  label: string
  accent?: 'sky' | 'amber'
}) {
  const name = useId()
  const [q, setQ] = useState('')
  const { data: allRegions } = useRegionsData()
  const allNames = new Map((allRegions ?? []).map((r) => [r.id, r.name]))
  const query = q.trim().toLowerCase()
  const shown = query ? regions.filter((r) => r.name.toLowerCase().includes(query)) : regions
  const kinds = [...new Set(shown.map((r) => r.kind))].sort((a, b) => KIND_ORDER.indexOf(a) - KIND_ORDER.indexOf(b))
  const on = accent === 'amber' ? 'border-amber-300/80 bg-amber-300/20 text-white' : 'border-sky-300/80 bg-sky-300/20 text-white'

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="sr-only">{label}</legend>
      {regions.length > 4 && (
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search regions"
          aria-label={`Search ${label.toLowerCase()}`}
          className="h-8 rounded-lg border border-white/20 bg-white/5 px-2.5 text-sm text-white placeholder:text-white/60 focus-visible:outline-2 focus-visible:outline-ring"
        />
      )}
      {kinds.map((kind) => {
        // Districts (many) are grouped under their parent division; other kinds are one flat group.
        const ofKind = shown.filter((r) => r.kind === kind)
        const groups: [string | null, Region[]][] =
          kind === 'district'
            ? [...new Set(ofKind.map((r) => r.parent ?? ''))].map((p): [string | null, Region[]] => [allNames.get(p) ?? p, ofKind.filter((r) => (r.parent ?? '') === p)])
            : [[null, ofKind]]
        return (
        <div key={kind} className="flex flex-col gap-1">
          {kinds.length > 1 && <p className="text-xs text-white/80">{KIND_LABEL[kind] ?? kind}</p>}
          {groups.map(([groupName, list]) => (
          <div key={groupName ?? kind} className="flex flex-col gap-1">
          {groupName && <p className="pl-1 text-[11px] text-white/65">{groupName}</p>}
          <div className="flex flex-wrap gap-1">
            {list
              .map((r) => (
                <label
                  key={r.id}
                  className={cn(
                    'cursor-pointer rounded-full border px-2.5 py-1 text-[13px] max-md:px-3 max-md:py-2',
                    'has-focus-visible:outline-2 has-focus-visible:outline-offset-1 has-focus-visible:outline-ring',
                    selected === r.id ? on : 'border-white/20 text-white/90 hover:bg-white/10',
                  )}
                >
                  {/* onClick too: re-clicking the current region still confirms the step. */}
                  <input
                    type="radio"
                    name={name}
                    className="sr-only"
                    checked={selected === r.id}
                    onChange={() => onSelect(r.id)}
                    onClick={() => selected === r.id && onSelect(r.id)}
                  />
                  {r.name}
                </label>
              ))}
          </div>
          </div>
          ))}
        </div>
        )
      })}
      {shown.length === 0 && <p className="text-xs text-white/80">No region matches “{q}”.</p>}
      <p className="text-xs text-white/75">Tip: you can also click a region on the globe.</p>
    </fieldset>
  )
}

// ---------- time range ----------

function TimeRange({ variable, regionId }: { variable: Variable; regionId: string }) {
  const [recStart, recEnd] = variable.periods[regionId]
  const steps = useMemo(() => dateSteps(recStart, recEnd), [recStart, recEnd])
  const rangeStart = useAppStore((s) => s.rangeStart)
  const rangeEnd = useAppStore((s) => s.rangeEnd)
  const setRange = useAppStore((s) => s.setRange)

  const i0 = Math.max(0, rangeStart ? steps.indexOf(rangeStart) : 0)
  const i1Raw = rangeEnd ? steps.indexOf(rangeEnd) : steps.length - 1
  const i1 = i1Raw < 0 ? steps.length - 1 : i1Raw
  const start = steps[i0]
  const end = steps[i1]
  const years = spanYears(start, end)
  const minGap = start.length === 7 ? 23 : 1 // at least 2 years (monthly) or 2 points (annual)

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span id="range-label" className="sr-only">
          Time range
        </span>
        <span className="text-xs tabular-nums text-white/90">
          {formatStep(start)} – {formatStep(end)} ({years.toFixed(years < 10 ? 1 : 0)} yr)
        </span>
      </div>
      <Slider
        aria-labelledby="range-label"
        min={0}
        max={steps.length - 1}
        step={1}
        minStepsBetweenValues={minGap}
        value={[i0, i1]}
        onValueChange={(v) => {
          const [a, b] = v as number[]
          setRange(a === 0 ? null : steps[a], b === steps.length - 1 ? null : steps[b])
        }}
        thumbLabel={(i) => (i === 0 ? 'Start of range' : 'End of range')}
        thumbValueText={(v) => formatStep(steps[v], true)}
      />
      <p className="text-xs text-white/80">
        Full record for this region: {formatStep(recStart)} – {formatStep(recEnd)}. The range never extends past it.
      </p>
      {years < SHORT_RECORD_YEARS && (
        <p role="status" className="rounded-lg border border-amber-300/40 bg-amber-300/10 px-2 py-1.5 text-xs text-amber-100">
          Under {SHORT_RECORD_YEARS} years: a real trend can easily be missed. A "not significant" result here
          means "cannot tell yet", not "no change".
        </p>
      )}
    </div>
  )
}

// ---------- run ----------

function RunAnalysis({ variable, regionId, blocked }: { variable: Variable; regionId: string; blocked: string | null }) {
  const status = useAppStore((s) => s.analysisStatus)
  const error = useAppStore((s) => s.analysisError)
  const rangeStart = useAppStore((s) => s.rangeStart)
  const rangeEnd = useAppStore((s) => s.rangeEnd)

  // Drop a stale error when the inputs change.
  useEffect(() => {
    if (useAppStore.getState().analysisStatus === 'error') useAppStore.setState({ analysisStatus: 'idle', analysisError: null })
  }, [variable.id, regionId, rangeStart, rangeEnd])

  // Same action as the AI assistant's run_analysis tool (lib/runAnalysis.ts).
  const run = () => void runAnalysisFromStore('button')

  return (
    <div className="flex flex-col gap-2">
      {blocked && <p className="text-xs text-white/80">{blocked}</p>}
      <Button onClick={run} disabled={status === 'running' || !!blocked} className="h-10 bg-sky-300 text-slate-950 hover:bg-sky-200">
        {status === 'running' ? 'Running…' : 'Run analysis'}
      </Button>
      {status === 'error' && (
        <p role="alert" className="text-xs text-red-200">
          Analysis failed: {error}
        </p>
      )}
    </div>
  )
}

// ---------- compare ----------

function ComparePicker({
  otherRegions,
  otherVariables,
  onPickedRegion,
}: {
  otherRegions: Region[]
  otherVariables: Variable[]
  onPickedRegion: () => void
}) {
  const mode = useAppStore((s) => s.compareMode)
  const setMode = useAppStore((s) => s.setCompareMode)
  const compareRegion = useAppStore((s) => s.compareRegion)
  const setCompareRegion = useAppStore((s) => s.setCompareRegion)
  const extra = useAppStore((s) => s.compareVariables)
  const setExtra = useAppStore((s) => s.setCompareVariables)
  const modeName = useId()

  const modes: { id: 'regions' | 'variables'; label: string; disabled: boolean }[] = [
    { id: 'regions', label: 'Another region', disabled: otherRegions.length === 0 },
    { id: 'variables', label: 'More variables', disabled: otherVariables.length === 0 },
  ]

  return (
    <div className="flex flex-col gap-2">
      <div role="radiogroup" aria-label="What to compare" className="grid grid-cols-2 gap-1 rounded-full border border-white/15 p-0.5">
        {modes.map((m) => (
          <label
            key={m.id}
            className={cn(
              'cursor-pointer rounded-full px-2 py-1 text-center text-[13px] max-md:py-2',
              'has-focus-visible:outline-2 has-focus-visible:outline-ring has-disabled:cursor-not-allowed has-disabled:opacity-40',
              mode === m.id ? 'bg-amber-300 font-medium text-slate-950' : 'text-white/90 hover:bg-white/10',
            )}
          >
            <input type="radio" name={modeName} className="sr-only" disabled={m.disabled} checked={mode === m.id} onChange={() => setMode(m.id)} />
            {m.label}
          </label>
        ))}
      </div>

      {mode === 'regions' && (
        <>
          <RegionPicker
            regions={otherRegions}
            selected={compareRegion}
            onSelect={(id) => {
              setCompareRegion(id)
              onPickedRegion()
            }}
            label="Second region"
            accent="amber"
          />
          <p className="text-xs text-white/80">Trends are compared on the years both records cover. Levels are not compared.</p>
        </>
      )}

      {mode === 'variables' && (
        <div className="flex flex-col gap-1">
          <p className="text-xs text-white/80">Add up to three more variables for this region ({extra.length}/3):</p>
          <div className="flex flex-col gap-0.5">
            {otherVariables.map((v) => {
              const on = extra.includes(v.id)
              return (
                <div key={v.id} className="flex items-center gap-1">
                  <label
                    className={cn(
                      'flex flex-1 cursor-pointer items-baseline justify-between gap-2 rounded-lg border px-2 py-1.5 text-sm',
                      'has-focus-visible:outline-2 has-focus-visible:outline-offset-1 has-focus-visible:outline-ring',
                      'has-disabled:cursor-not-allowed has-disabled:opacity-40',
                      on ? 'border-amber-300/70 bg-amber-300/15 text-white' : 'border-transparent text-white/90 hover:bg-white/10',
                    )}
                  >
                    <span className="flex items-baseline gap-2">
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={on}
                        disabled={!on && extra.length >= 3}
                        onChange={() => setExtra(on ? extra.filter((x) => x !== v.id) : [...extra, v.id])}
                      />
                      <span aria-hidden className={cn('grid size-3 shrink-0 place-items-center rounded-[3px] border border-white/70 text-[9px] leading-none', on && 'border-amber-300 bg-amber-300 text-slate-950')}>
                        {on ? '✓' : ''}
                      </span>
                      {v.name}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-white/80">
                      {v.period[0].slice(0, 4)}–{v.period[1].slice(0, 4)}
                    </span>
                  </label>
                  <DescribeDialog variable={v} />
                </div>
              )
            })}
          </div>
          <p className="text-xs text-white/80">Moving together is not cause and effect.</p>
        </div>
      )}
    </div>
  )
}
