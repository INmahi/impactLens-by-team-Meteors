# @trend/stats

Mann-Kendall trend tests and Sen's slope for Trend Detective. TypeScript, no dependencies, runs in the browser (Web Worker) and in Node.

## Use
```ts
import { analyzeTrend } from '@trend/stats';

const report = analyzeTrend({
  dates: ['1992-01', '1992-02', /* ... */],   // "YYYY-MM" monthly, or "YYYY" annual
  values: [0, -3.1, /* ... */],                // null where missing
  frequency: 'monthly',
  kind: 'cumulative',                          // 'level' | 'cumulative' | 'rate'
});

report.test.trend        // 'increasing' | 'decreasing' | 'no trend'
report.test.p            // two-sided p-value
report.slope.perYear     // Sen's slope, with report.slope.lower / upper (95%)
report.crossChecks       // Hamed-Rao, Seasonal (monthly only), plain Mann-Kendall
report.notes             // plain-language caveats for the Notes panel
```
In the app, call it through `src/worker.ts` so the globe never stalls.

## What is inside
| Function | What it is |
|---|---|
| `analyzeTrend` | The one function the app calls |
| `ar1MannKendall` | Headline test: Mann-Kendall with a lag-1 autocorrelation correction; respects gaps |
| `mannKendall` | Plain test (Mann 1945, Kendall 1975) with tie correction |
| `hamedRaoMannKendall` | Hamed and Rao (1998) variance correction |
| `prewhitenedMannKendall` | Trend-free pre-whitening (Yue et al. 2002). Kept for reference; not used as a headline |
| `seasonalMannKendall` | Hirsch, Slack and Smith (1982) |
| `senSlope` | Theil-Sen slope and confidence interval (Sen 1968), on real time values |
| `deseasonalizeWithTrend` | Removes the seasonal cycle without turning a trend into a staircase |

## Tests
```
python pipeline/stats/make_golden.py 1000      # Python reference -> test/golden.json
node packages/stats/test/golden.test.ts        # parity with pymannkendall and scipy
node packages/stats/test/analyze.test.ts       # end to end
node packages/stats/test/simulate.ts 1000      # error rates on known-answer series (about 3 minutes)
```
Needs Node 22.18 or later (it runs TypeScript files directly). Results of the last simulation run are in `test/simulation-results.md`.

## Why the headline test is not the plain one
Climate series are autocorrelated. On series with no trend at all, the plain test reported a "significant" trend 30% of the time with strong autocorrelation and 50% with very strong; the headline test stayed between 3% and 10%. The cost is lower power on short annual records, which the report flags as `lowPower`.
