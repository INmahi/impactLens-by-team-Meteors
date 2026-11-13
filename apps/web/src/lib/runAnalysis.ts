// The one "Run analysis" action, shared by the button (LeftDrawer) and the AI assistant, so both do exactly
// the same thing. Reads the inputs from the store, runs the stats worker, writes the result to the store.
// Every statistic comes from @trend/stats in the worker (CLAUDE.md hard rule).
import { getSeriesCached, getVariablesCached } from '@/lib/useData'
import { runStats, runTrend } from '@/lib/stats'
import { useAppStore, type AnalysisResult } from '@/state/store'

export async function runAnalysisFromStore(by: 'button' | 'assistant' = 'button'): Promise<AnalysisResult | null> {
  const s0 = useAppStore.getState()
  s0.setLastRunBy(by)
  const variables = await getVariablesCached()
  const variable = variables.find((v) => v.id === s0.variable)
  const regionId = s0.region
  if (!variable || !regionId || !variable.periods[regionId]) {
    s0.setAnalysisError('Choose a variable and a region first.')
    return null
  }
  const [recStart, recEnd] = variable.periods[regionId]
  s0.setAnalysisRunning()
  const start = s0.rangeStart ?? recStart
  const end = s0.rangeEnd ?? recEnd
  const { compareMode, compareRegion, compareVariables } = s0
  try {
    const series = await getSeriesCached(variable.id, regionId)
    const asInput = (x: typeof series) => ({ dates: x.dates, values: x.values, frequency: x.frequency, kind: x.kind })
    const input = { ...asInput(series), start, end }
    const report = await runTrend(input)

    // Compare two regions: difference of trends on the common period (paired bootstrap).
    let compare: AnalysisResult['compare'] = null
    if (compareMode === 'regions' && compareRegion && compareRegion !== regionId && variable.regions.includes(compareRegion)) {
      const b = await getSeriesCached(variable.id, compareRegion)
      compare = { region: compareRegion, report: await runStats('compare', { a: asInput(series), b: asInput(b), start, end }) }
    }

    // More variables in the same region: each one's trend, and its correlation with the main variable.
    const extras: AnalysisResult['extras'] = []
    if (compareMode === 'variables') {
      for (const id of compareVariables) {
        const other = await getSeriesCached(id, regionId).catch(() => null)
        if (!other) continue
        const rep = await runTrend({ ...asInput(other), start, end }).catch(() => null)
        if (!rep) continue
        const correlation = await runStats('correlate', { x: asInput(series), y: asInput(other), start, end }).catch(() => null)
        extras.push({ variable: id, report: rep, correlation })
      }
    }

    // Show the result now; the slow extras ("years needed" when not significant, and the Monte Carlo of the
    // source's stated uncertainty, ~4 s for 600 points) fill in when ready. They are queued after the
    // compare / correlation jobs, because the worker runs one job at a time.
    const sigma = series.sigma
    const wantDetect = !report.test.significant
    const wantUnc = !!sigma && sigma.some((x) => x != null)
    const pending = [...(wantDetect ? (['detect'] as const) : []), ...(wantUnc ? (['uncertainty'] as const) : [])]
    const result: AnalysisResult = { variable: variable.id, region: regionId, start, end, report, detect: null, uncertainty: null, compare, extras, pending }
    useAppStore.getState().setAnalysisDone(result)
    const st = useAppStore.getState()
    if (wantDetect)
      runStats('detectability', input)
        .catch(() => null)
        .then((detect) => st.patchAnalysis(report, { detect }, 'detect'))
    if (wantUnc)
      runStats('uncertainty', { ...input, sigma: sigma! })
        .catch(() => null)
        .then((uncertainty) => st.patchAnalysis(report, { uncertainty }, 'uncertainty'))
    return result
  } catch (e) {
    useAppStore.getState().setAnalysisError(e instanceof Error ? e.message : String(e))
    return null
  }
}
