// Left drawer: the analysis inputs (plan section 4). Variable, region, time range, Run analysis.
// Everything is read from variables.json / regions.json: no variable or region id is hard-coded.
import { useEffect, useId, useMemo, useState } from 'react'
import type { Region, Variable } from '@trend/contract'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { mapModeForVariable, mapModes } from '@/globe'
import { runTrend } from '@/lib/stats'
import { dateSteps, formatStep, getSeriesCached, spanYears, useRegionsData, useVariablesData } from '@/lib/useData'
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
  global: 'Global',
}
const KIND_ORDER = ['global', 'ice_sheet', 'ice_sheet_basin', 'glacier_region', 'coastal_sea']

/** Group headings for variables that share `group` (contract `group` ids). */
function groupLabel(group: string): string {
  return group.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
}

export default function LeftDrawer() {
  const [open, setOpen] = useState(true)
  const bodyId = useId()
  const { data: variables } = useVariablesData()
  const { data: regions } = useRegionsData()

  return (
    <section aria-label="Analysis inputs" className="glass-strong flex max-h-[calc(100dvh-7.5rem)] w-80 flex-col overflow-hidden">
      <header className="flex items-center justify-between gap-2 px-4 pt-3 pb-2">
        <h2 className="text-sm font-semibold tracking-wide text-white">Analyse a trend</h2>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((o) => !o)}
          className="rounded-md px-2 py-1 text-xs text-white/90 hover:bg-white/10"
        >
          {open ? 'Hide' : 'Show'}
        </button>
      </header>
      {open && (
        <div id={bodyId} className="flex flex-col gap-4 overflow-y-auto overscroll-contain px-4 pb-4">
          {!variables || !regions ? (
            <p className="text-sm text-white/90">Loading…</p>
          ) : (
            <Inputs variables={variables} regions={regions} />
          )}
        </div>
      )}
    </section>
  )
}

function Inputs({ variables, regions }: { variables: Variable[]; regions: Region[] }) {
  const variableId = useAppStore((s) => s.variable)
  const regionId = useAppStore((s) => s.region)
  const setVariable = useAppStore((s) => s.setVariable)
  const setRegion = useAppStore((s) => s.setRegion)
  const setMapLayer = useAppStore((s) => s.setMapLayer)

  const variable = variables.find((v) => v.id === variableId) ?? null
  const modes = useMemo(() => mapModes(variables), [variables])

  function chooseVariable(v: Variable) {
    setVariable(v.id)
    // Show the variable's own map if it has one; otherwise the globe hides layers (sea level).
    setMapLayer(mapModeForVariable(modes, v))
    // Keep the region if it is valid for the new variable; otherwise pick its first region.
    if (!regionId || !v.regions.includes(regionId)) setRegion(v.regions[0] ?? null)
  }

  return (
    <>
      <VariablePicker variables={variables} selected={variableId} onSelect={chooseVariable} />
      {variable && <RegionPicker variable={variable} regions={regions} selected={regionId} onSelect={setRegion} />}
      {variable && regionId && variable.periods[regionId] && (
        <>
          <TimeRange variable={variable} regionId={regionId} />
          <RunAnalysis variable={variable} regionId={regionId} />
        </>
      )}
    </>
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
    <label
      key={v.id}
      className={cn(
        'flex cursor-pointer items-baseline justify-between gap-2 rounded-lg border px-2 py-1.5 text-sm',
        'has-focus-visible:outline-2 has-focus-visible:outline-offset-1 has-focus-visible:outline-ring',
        selected === v.id ? 'border-sky-300/70 bg-sky-300/15 text-white' : 'border-transparent text-white/90 hover:bg-white/10',
        sub && 'ml-4 text-[13px]',
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

// ---------- region picker ----------

function RegionPicker({
  variable,
  regions,
  selected,
  onSelect,
}: {
  variable: Variable
  regions: Region[]
  selected: string | null
  onSelect: (id: string) => void
}) {
  const name = useId()
  const valid = regions.filter((r) => variable.regions.includes(r.id))
  const kinds = [...new Set(valid.map((r) => r.kind))].sort((a, b) => KIND_ORDER.indexOf(a) - KIND_ORDER.indexOf(b))

  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="mb-1 text-xs font-medium tracking-wide text-white/85 uppercase">Region</legend>
      {kinds.map((kind) => (
        <div key={kind} className="flex flex-col gap-0.5">
          {kinds.length > 1 && <p className="px-2 text-xs text-white/80">{KIND_LABEL[kind] ?? kind}</p>}
          <div className="flex flex-wrap gap-1">
            {valid
              .filter((r) => r.kind === kind)
              .map((r) => (
                <label
                  key={r.id}
                  className={cn(
                    'cursor-pointer rounded-full border px-2.5 py-1 text-[13px]',
                    'has-focus-visible:outline-2 has-focus-visible:outline-offset-1 has-focus-visible:outline-ring',
                    selected === r.id ? 'border-sky-300/80 bg-sky-300/20 text-white' : 'border-white/20 text-white/90 hover:bg-white/10',
                  )}
                >
                  <input type="radio" name={name} className="sr-only" checked={selected === r.id} onChange={() => onSelect(r.id)} />
                  {r.name}
                </label>
              ))}
          </div>
        </div>
      ))}
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
        <span id="range-label" className="text-xs font-medium tracking-wide text-white/85 uppercase">
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

function RunAnalysis({ variable, regionId }: { variable: Variable; regionId: string }) {
  const status = useAppStore((s) => s.analysisStatus)
  const error = useAppStore((s) => s.analysisError)
  const rangeStart = useAppStore((s) => s.rangeStart)
  const rangeEnd = useAppStore((s) => s.rangeEnd)
  const running = useAppStore.getState
  const [recStart, recEnd] = variable.periods[regionId]

  // Drop a stale error when the inputs change.
  useEffect(() => {
    if (useAppStore.getState().analysisStatus === 'error') useAppStore.setState({ analysisStatus: 'idle', analysisError: null })
  }, [variable.id, regionId, rangeStart, rangeEnd])

  async function run() {
    const s = running()
    s.setAnalysisRunning()
    const start = rangeStart ?? recStart
    const end = rangeEnd ?? recEnd
    try {
      const series = await getSeriesCached(variable.id, regionId)
      const report = await runTrend({
        dates: series.dates,
        values: series.values,
        frequency: series.frequency,
        kind: series.kind,
        start,
        end,
      })
      useAppStore.getState().setAnalysisDone({ variable: variable.id, region: regionId, start, end, report })
    } catch (e) {
      useAppStore.getState().setAnalysisError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="flex flex-col gap-2 border-t border-white/10 pt-3">
      <Button onClick={run} disabled={status === 'running'} className="h-10 bg-sky-300 text-slate-950 hover:bg-sky-200">
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
