// The assistant's only powers: read the catalogue, set the analysis inputs (checked against the data files),
// run the analysis (the same function as the button), and read the result. It never computes statistics:
// every number it may quote comes from the app's own engine via get_result.
import type { Region, Variable } from '@trend/contract'
import { formatP } from '@trend/stats'
import { mapModeForVariable, mapModes } from '@/globe'
import { runAnalysisFromStore } from '@/lib/runAnalysis'
import { dateSteps, formatStep, formatUnitsText, getRegionsCached, getVariablesCached, spanYears } from '@/lib/useData'
import {
  compareVerdict,
  correlationText,
  detectText,
  fmt,
  interpretation,
  rateUnits,
  trendVerdict,
  uncertaintyText,
} from '@/lib/verdict'
import { useAppStore, type AnalysisResult } from '@/state/store'
import type { ToolSpec } from './llm'

export const TOOLS: ToolSpec[] = [
  {
    type: 'function',
    function: {
      name: 'get_catalog',
      description: 'List every variable the app can analyse, with its valid regions and the years each record covers. Call this before offering choices.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_analysis_inputs',
      description:
        'Set the analysis inputs in the app (they appear in the left panel). Dates: "YYYY" for annual variables, "YYYY-MM" for monthly ones; omit start/end for the full record. compare_mode "regions" needs compare_region (same variable); "variables" needs compare_variables (1-3 ids valid for the region).',
      parameters: {
        type: 'object',
        properties: {
          variable: { type: 'string', description: 'variable id from get_catalog' },
          region: { type: 'string', description: 'region id valid for that variable' },
          start: { type: 'string' },
          end: { type: 'string' },
          compare_mode: { type: 'string', enum: ['none', 'regions', 'variables'] },
          compare_region: { type: 'string' },
          compare_variables: { type: 'array', items: { type: 'string' } },
        },
        required: ['variable', 'region'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_analysis',
      description: 'Run the analysis with the current inputs (exactly what the Run analysis button does) and return the result summary.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_result',
      description: 'Return the current result summary (verdict, numbers with 95% intervals, p-values, dataset, caveats, comparisons).',
      parameters: { type: 'object', properties: {} },
    },
  },
]

async function catalog() {
  const [variables, regions] = await Promise.all([getVariablesCached(), getRegionsCached()])
  const name = (id: string) => regions.find((r) => r.id === id)?.name ?? id
  return {
    variables: variables.map((v) => ({
      id: v.id,
      name: v.name,
      units: formatUnitsText(v.units),
      frequency: v.frequency,
      group: v.group ?? null,
      dataset: v.source.name,
      regions: v.regions.map((id) => ({ id, name: name(id), from: v.periods[id][0], to: v.periods[id][1] })),
    })),
    compare: 'regions = same variable in another of its regions; variables = up to 3 other variables that have the same region',
  }
}

function fail(errors: string[]) {
  return { ok: false, errors }
}

async function setInputs(args: Record<string, unknown>) {
  const [variables, regions] = await Promise.all([getVariablesCached(), getRegionsCached()])
  const v = variables.find((x) => x.id === args.variable || x.name.toLowerCase() === String(args.variable ?? '').toLowerCase())
  if (!v) return fail([`unknown variable ${String(args.variable)}; valid: ${variables.map((x) => x.id).join(', ')}`])
  const r = regions.find((x) => x.id === args.region || x.name.toLowerCase() === String(args.region ?? '').toLowerCase())
  if (!r || !v.regions.includes(r.id)) return fail([`region ${String(args.region)} is not valid for ${v.id}; valid: ${v.regions.join(', ')}`])
  const [recStart, recEnd] = v.periods[r.id]
  const steps = dateSteps(recStart, recEnd)
  const monthly = recStart.length === 7
  const norm = (d: unknown, edge: 'start' | 'end'): string | null => {
    if (d == null || d === '') return null
    let s = String(d).trim()
    if (monthly && /^\d{4}$/.test(s)) s = edge === 'start' ? `${s}-01` : `${s}-12`
    if (!monthly && /^\d{4}-\d{2}/.test(s)) s = s.slice(0, 4)
    return s
  }
  let start = norm(args.start, 'start') ?? recStart
  let end = norm(args.end, 'end') ?? recEnd
  if (start < recStart) start = recStart
  if (end > recEnd) end = recEnd
  if (!steps.includes(start) || !steps.includes(end) || start >= end)
    return fail([`the period must lie inside ${recStart} to ${recEnd} (format ${monthly ? 'YYYY-MM' : 'YYYY'}), start before end`])
  const mode = (args.compare_mode as string) || 'none'
  let compareRegion: string | null = null
  let compareVars: string[] = []
  if (mode === 'regions') {
    const cr = regions.find((x) => x.id === args.compare_region || x.name.toLowerCase() === String(args.compare_region ?? '').toLowerCase())
    if (!cr || cr.id === r.id || !v.regions.includes(cr.id))
      return fail([`compare_region must be another region of ${v.id}: ${v.regions.filter((x) => x !== r.id).join(', ')}`])
    compareRegion = cr.id
  } else if (mode === 'variables') {
    const ids = (Array.isArray(args.compare_variables) ? args.compare_variables : []).map(String)
    const valid = variables.filter((x) => x.id !== v.id && x.regions.includes(r.id)).map((x) => x.id)
    compareVars = ids.filter((id) => valid.includes(id)).slice(0, 3)
    if (!compareVars.length) return fail([`compare_variables must be 1-3 of: ${valid.join(', ') || '(none for this region)'}`])
  } else if (mode !== 'none') return fail(['compare_mode must be none, regions or variables'])

  // Apply in the same order as the left panel (variable resets range and compare picks).
  const s = useAppStore.getState()
  s.setVariable(v.id)
  s.setMapLayer(mapModeForVariable(mapModes(variables), v))
  s.setRegion(r.id)
  s.setRange(start === recStart ? null : start, end === recEnd ? null : end)
  s.setCompareMode(mode as 'none' | 'regions' | 'variables')
  if (compareRegion) s.setCompareRegion(compareRegion)
  if (compareVars.length) s.setCompareVariables(compareVars)
  return {
    ok: true,
    set: {
      variable: v.name,
      region: r.name,
      period: `${formatStep(start)} to ${formatStep(end)} (${Math.round(spanYears(start, end))} years)`,
      compare: mode === 'regions' ? `vs ${regions.find((x) => x.id === compareRegion)?.name}` : mode === 'variables' ? compareVars.join(', ') : 'none',
    },
  }
}

/** Compact, plain summary of the current result (all text from lib/verdict.ts, all numbers from the engine). */
export async function resultSummary(a: AnalysisResult | null = useAppStore.getState().analysis) {
  if (!a) return { ok: false, errors: ['no analysis has been run yet'] }
  const [variables, regions] = await Promise.all([getVariablesCached(), getRegionsCached()])
  const v = variables.find((x) => x.id === a.variable) as Variable
  const r = regions.find((x) => x.id === a.region) as Region
  const rep = a.report
  const verdict = trendVerdict(v, r, rep)
  const out: Record<string, unknown> = {
    variable: v.name,
    region: r.name,
    period: `${formatStep(a.start)} to ${formatStep(a.end)}`,
    dataset: `${v.source.name}${v.source.version ? `, version ${v.source.version}` : ''}${v.synthetic ? ' (SYNTHETIC test data)' : ' (real observations)'}`,
    verdict: verdict.headline,
    detail: verdict.detail,
    numbers: {
      trend: `${fmt(rep.slope.perYear)} ${rateUnits(v)}`,
      interval95: `${fmt(rep.slope.lower)} to ${fmt(rep.slope.upper)} ${rateUnits(v)}`,
      p: formatP(rep.test.p),
      significant: rep.test.significant,
      points: rep.n,
      low_power: rep.lowPower,
      test: rep.test.method,
      cross_checks: rep.crossChecks.map((c) => `${c.method}: ${formatP(c.p)}`),
    },
    interpretation: interpretation(v, r, rep, variables),
    notes: [...new Set([...(r.notes ?? []), ...rep.notes])].slice(0, 4),
  }
  if (a.detect) out.years_needed = detectText(v, a.detect)
  if (a.uncertainty) out.source_uncertainty = uncertaintyText(v, a.uncertainty)
  if (a.pending?.length) out.still_computing = a.pending
  if (a.compare) {
    const B = regions.find((x) => x.id === a.compare!.region) as Region
    const cv = compareVerdict(v, r, B, a.compare.report)
    out.comparison = { headline: cv.headline, detail: cv.detail, notes: cv.notes.slice(0, 3) }
  }
  if (a.extras.length) {
    out.other_variables = a.extras.map((x) => {
      const xv = variables.find((y) => y.id === x.variable) as Variable
      const t = trendVerdict(xv, r, x.report)
      return {
        variable: xv.name,
        verdict: t.headline,
        trend: `${fmt(x.report.slope.perYear)} ${rateUnits(xv)} (95% interval ${fmt(x.report.slope.lower)} to ${fmt(x.report.slope.upper)})`,
        p: formatP(x.report.test.p),
        dataset: xv.source.name,
        relation: x.correlation ? correlationText(v, xv, x.correlation, r) : null,
      }
    })
  }
  return out
}

export async function runTool(name: string, rawArgs: string, onStatus: (s: string) => void): Promise<unknown> {
  let args: Record<string, unknown> = {}
  try {
    args = rawArgs ? JSON.parse(rawArgs) : {}
  } catch {
    args = {}
  }
  switch (name) {
    case 'get_catalog':
      return catalog()
    case 'set_analysis_inputs':
      return setInputs(args)
    case 'run_analysis': {
      onStatus('Running the analysis…')
      const res = await runAnalysisFromStore('assistant')
      if (!res) return { ok: false, errors: [useAppStore.getState().analysisError ?? 'the analysis failed'] }
      return resultSummary(res)
    }
    case 'get_result':
      return resultSummary()
    default:
      return { ok: false, errors: [`unknown tool ${name}`] }
  }
}
