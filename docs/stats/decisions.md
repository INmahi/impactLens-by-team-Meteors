# Statistics decisions

One entry per decision: question, choice, why, alternatives rejected, references, known limits.
Owner: stats-lead. Numbers quoted here come from `packages/stats/test/simulation-results.md`
(re-run with `pnpm --filter @trend/stats simulate`).

Pinned reference libraries (checked 2026-11-13 in the project's `uv` environment; `uv.lock` is the exact record):
numpy 2.5.4, scipy 1.18.1, pymannkendall 1.4.3, statsmodels 0.15.0, arch 8.0.0.
The TypeScript engine (`packages/stats`) has no dependencies.

---

## D1 (M0, recorded 2026-11-13). Headline trend test

- **Question:** which Mann-Kendall variant is the verdict?
- **Choice:** Mann-Kendall with a lag-1 effective-sample-size correction (`ar1MannKendall`): Var(S) x (1 + r) / (1 - r), r = lag-1 autocorrelation of the Sen-detrended residuals, bias-corrected r + (1 + 4r)/n, clipped to [0, 0.95]. Monthly data are deseasonalised first with `deseasonalizeWithTrend`. Rate = Sen's slope on decimal-year time; its 95% interval uses the same variance factor.
- **Why:** false positives 3-10% under autocorrelation where the plain test gives 30-50%; corrected interval coverage 91-98% (table in `simulation-results.md`).
- **Rejected:** plain MK (30-50% false positives); trend-free pre-whitening (36-70%); Hamed-Rao with all lags (7-10% with no autocorrelation). Hamed-Rao, Seasonal MK and plain MK stay as cross-checks.
- **References:** Mann (1945); Kendall (1975); Sen (1968); Hamed and Rao (1998); Yue et al. (2002); Hirsch, Slack and Smith (1982).

---

## D2 (M5). Shared building blocks

### D2.1 Seeded random numbers, identical in TypeScript and Python
- **Choice:** xoshiro128** (Blackman and Vigna 2018), state seeded by four splitmix32 outputs from a 32-bit integer seed. Uniform = u32 / 2^32. Integer in [0, k) = floor(uniform x k). Normal = Box-Muller with two fresh uniforms, `sqrt(-2 ln(1 - u1)) cos(2 pi u2)`, no caching.
- **Why:** every bootstrap and Monte Carlo result is reproducible from its seed, and the Python reference (`pipeline/stats/reference_m5.py`) draws the same numbers, so parity is exact rather than "within Monte Carlo error". The integer stream is bit-identical (checked on 10,000 draws in the golden test). Normals can differ by one unit in the last place where V8 and the C library disagree on `log`/`cos`, which is far inside the 1e-9 parity tolerance.
- **Rejected:** `Math.random` (not seedable); numpy's PCG64 (would need a port of numpy's normal sampler); comparing TS and Python only statistically (cannot catch small implementation bugs).
- **Known limits:** period 2^128 - 1, far beyond our use. Not cryptographic (irrelevant).

### D2.2 Putting two series on one time axis
- **Choice:**
  1. Same frequency: keep it. Mixed monthly and annual: compare on **calendar-year means** of the monthly series. The monthly series is first deseasonalised with `deseasonalizeWithTrend` over the requested range; a year's mean needs **at least 9 of 12 months**, otherwise that year is missing.
  2. **Common period** = latest first valid date to earliest last valid date (inside the user's range). Only that period is analysed. Never padded, never extrapolated.
  3. Monthly series are deseasonalised exactly as `analyzeTrend()` does (same grid origin: January of the first year), so each series' slope in a comparison equals the single-series slope for the same period.
  4. Gaps stay missing. Each series uses its own valid points; `nCommon` counts time steps where both are valid.
- **Why:** levels are never compared (each regional sea level has its own zero); only trends and anomalies. The 9-month rule keeps partial years from adding seasonal bias.
- **Rejected:** interpolating to a common grid (invents data); summing monthly values (not meaningful for levels).

### D2.3 Fast Sen's slope for resampling
- **Choice:** `senSlopeValue()` computes the same median of pairwise slopes as `senSlope()` with a selection algorithm (Numerical Recipes `select`) instead of a full sort. It gives the identical number (checked in the parity test) and is several times faster, which the bootstrap and Monte Carlo loops need.

---

## D3 (M5). Compare two regions: difference of Sen's slopes

- **Question:** is the trend in region A different from the trend in region B (two coastal seas, a sea against the global mean, Greenland against Antarctica)?
- **Choice (`compareTrends`):**
  1. Put both series on the common period (D2.2). Run `analyzeTrend()` on each over that period (headline Mann-Kendall + Sen's slope per region, as the rules require). Each slope in the comparison therefore equals the single-region slope for the same period.
  2. Statistic: d = Sen slope(A) - Sen slope(B), units per year.
  3. Standard error: Var(d) = sA^2 + sB^2 - 2 rho sA sB, where sA and sB are the half-widths of each series' **autocorrelation-corrected Sen interval** divided by 1.96 (the headline interval, coverage 91-98% in simulation), and rho is the **correlation between the two slopes**, estimated by a **paired moving-block bootstrap** of the residuals from each Sen line: the same block start indices are used for A and B, so their shared signal (El Nino in two seas, the common part of a sea and the global mean) and their cross-correlation are kept. Block length rule D3.1.
  4. z = d / se, two-sided normal p-value, 95% interval d +- 1.96 se. Significant when p < alpha (0.05).
  5. **Cross-check** shown in the stats panel: the headline test (lag-1 corrected Mann-Kendall) and corrected Sen's slope on the **difference series A - B** on the common grid (deseasonalised anomalies for monthly data). The shared signal cancels exactly there. When the two decisions differ, a "borderline" note is added.
  6. Defaults: B = 1,000 bootstrap replicates, fixed seed (20261113), both reported. The bootstrap only estimates rho, whose Monte Carlo standard error is about (1 - rho^2)/sqrt(B), about 0.02-0.03; the p-value is otherwise analytic.
  7. `lowPower` when the common period is under 30 years or has under 30 valid common points (same rule as `analyzeTrend`). At least 8 common points are required, otherwise an error.
  8. Verdict key: `a_faster`, `b_faster` (significant, same sign, larger absolute slope), `different_directions` (significant, opposite signs), otherwise `cannot_tell_apart`. Wording in `docs/stats/wording.md`.
- **Why this and not a pure bootstrap interval (measured, 2026-11-13):** the first design used the bootstrap distribution of d directly (percentile interval and p). A residual block bootstrap of Sen's slope on short series is **too narrow**. Its slope SD was 0.88 of the true SD for 45 independent annual points, 0.78 at phi 0.3, and 0.60-0.69 at phi 0.6, and longer blocks made it worse, as the moving-block bootstrap under-weights the end points, which carry the most leverage for a slope. A circular block bootstrap was no better (0.66-0.81). Result: 9% false positives with no autocorrelation and 16-24% for annual series with phi 0.3-0.6. A correlation is a ratio, so the bootstrap's common scale bias cancels in rho; the scales come from the already-validated corrected Sen intervals instead. Simulated false-positive rate of the final design: 4.1-6.2% (table in `simulation-results.md`).
- **Why paired:** treating the two series as independent (adding the two interval widths in quadrature, or checking whether the two intervals overlap) ignores the shared signal. In simulation with half the variance shared, that naive test had 0.8-2.5% false positives and correspondingly little power; it is kept only as a simulation baseline.
- **Rejected:**
  - Percentile bootstrap interval and p of d (above: 9-24% false positives on annual data).
  - Bootstrapping the time-ordered pairs (A_t, B_t) themselves: moves points in time and destroys the trend.
  - Mann-Kendall on A - B as the headline: valid and kept as the cross-check, but its slope is not the difference of the two rates shown in each region's panel, which would show the user two different numbers for "the difference".
  - Stationary bootstrap (Politis and Romano 1994): random block lengths add variance for no gain here.
- **Parity:** exact algorithm parity with `pipeline/stats/reference_m5.py` (same PRNG, same draws), tolerance 1e-9.
- **Known limits:** residuals from a straight line contain any curvature (for example accelerating loss), which the bootstrap treats as noise. The z-test inherits the headline interval's behaviour: about 6-10% false positives for 30 annual points with strong autocorrelation. Monthly comparisons with B = 1,000 take about 1.5-2 s in the worker.
- **References:** Kuensch (1989), Ann. Statist. 17, 1217-1241 (moving-block bootstrap); Politis and White (2004) and Patton, Politis and White (2009) (block length); Sen (1968); Wilks (1997), J. Climate 10, 65-82 (block bootstrap for autocorrelated climate data).

### D3.1 Block length rule
- **Choice:** L = ceil((3/2)^(1/3) x (2r/(1 - r^2))^(2/3) x N^(1/3)), clipped to [1, N/2], r = the larger of the two series' headline lag-1 autocorrelations (bias-corrected, clipped to [0, 0.95]), N = number of time steps in the common period. This is the Politis-White (2004) optimal moving-block length with the AR(1) plug-in, G/g(0) = 2r/(1 - r^2). Typical values: 2 for 45 independent annual points, 4 at r = 0.3, 7-8 at r = 0.6; 14 months for monthly sea level at r = 0.6, 25 at r = 0.8.
- **Why:** it is a published rule and needs only r. Since the bootstrap now only estimates rho (a ratio), the scale bias that longer blocks cause cancels. The sensitivity of rho to L was not measured separately; the false-positive table, which uses this rule, is the evidence.
- **Rejected:** `arch.bootstrap.optimal_block_length` (full Politis-White with a flat-top lag window): needs a port of its bandwidth search for parity, for no measurable gain here.

---

## D4 (M5). Two variables together: correlation

- **Choice:**
  1. Same time axis as D2.2 (mixed frequencies to annual; monthly series deseasonalised; only overlapping time steps where both are valid).
  2. Correlations reported twice: **raw** (anomalies, not detrended) and **detrended** (each series minus its own Sen line). Only the detrended result supports a statement that the two vary together.
  3. Pearson r and Spearman rho (Pearson on average ranks, as `scipy.stats.spearmanr`).
  4. Effective sample size (Bretherton et al. 1999, eq. 31): n_eff = n (1 - r1x r1y) / (1 + r1x r1y), with r1 the lag-1 autocorrelation of each series (gap-aware, same bias correction and [0, 0.95] clipping as the headline test), capped to [3, n].
  5. p-value: Student t with n_eff - 2 degrees of freedom, t = r sqrt((n_eff - 2) / (1 - r^2)). The naive p-value (n - 2 df) is also returned, for the stats panel only.
  6. Optional lag scan 0..maxLag steps (temperature against mass loss rate: 0 to 3 years), x leading y, on detrended series. Each lag's p is also given Bonferroni-adjusted for the number of lags tried.
  7. Notes always include: trending series always correlate; correlation does not show cause.
- **Rejected:** raw correlation alone (two trending series always correlate); Granger causality and other causal tests (records too short; the rules forbid causal claims); Fisher z with nominal n (ignores autocorrelation).
- **References:** Bretherton, Widmann, Dymnikov, Wallace and Blade (1999), J. Climate 12, 1990-2009; Dawdy and Matalas (1964).
- **Known limits:** the AR(1) n_eff is approximate when the autocorrelation is not AR(1)-like. With strongly trending raw series the raw n_eff hits the floor of 3 and the raw p-value is near 1 by design.

---

## D5 (M5). Sensitivity of ice loss rate to temperature

- **Choice:** OLS of the rate series (Gt/yr) on temperature (deg C), per ice sheet, with **Newey-West (Bartlett kernel) HAC** standard errors. Lag truncation L = floor(4 (n/100)^(2/9)) (Newey and West 1994 rule of thumb; L = 3 for n = 45). Small-sample factor n/(n - 2) applied, and p and the 95% interval use Student t with n - 2 df. Reported on levels (the rule) and, as a check, on Sen-detrended series. Optional lag: temperature leading by 0-3 years.
- **Gaps:** lag products use only pairs truly l years apart (gap-aware), consistent with D1. Reference: numpy implementation in `reference_m5.py`, itself checked equal to `statsmodels` OLS `cov_type='HAC', cov_kwds={'maxlags': L, 'use_correction': True}, use_t=True` on series without gaps.
- **Why:** both series are autocorrelated; ordinary OLS errors would be too small.
- **Rejected:** ordinary OLS errors; total least squares (not needed for a descriptive sensitivity).
- **Known limits:** a slope on levels partly reflects two shared trends; the detrended slope is the interannual association. Neither is a causal effect. For Antarctica the mass loss is driven mainly by the ocean, not air temperature; the result must never be worded as "warm air melts Antarctica". HAC with n near 45 is still somewhat liberal (Kiefer and Vogelsang 2005).
- **References:** Newey and West (1987, 1994); statsmodels `cov_hac`.

---

## D6 (M5). Monte Carlo propagation of source 1-sigma

- **Choice:** draws = 2,000 (default, seeded). In each draw, perturb the analysed series by the source 1-sigma in two ways:
  - **independent:** value_i + sigma_i z_i (new z each time step);
  - **fully correlated:** value_i + sigma_i z (one z per draw).
  Recompute Sen's slope each time. The measurement half-widths are the 2.5% and 97.5% quantiles of the slope draws minus their median. Each is combined with the fit interval in quadrature, side by side. The reported interval is the **wider** of the two combinations; the report states which and how much wider than the fit interval it is.
- **Monthly series:** the seasonal cycle is estimated once from the reported values and the perturbations are added to the deseasonalised anomalies. Re-estimating the cycle in every draw would cost three full Sen fits per draw (tens of seconds in the browser). Each monthly mean is fitted on about 30 values, so a white perturbation moves it by about sigma/sqrt(30); this was not measured separately.
- **Cost:** about 40 ms for an annual series and about 6 s for a 630-month series (2 x 2,000 Sen fits) in Node on the dev machine. The app should run it on demand (a "include source uncertainty" action), or the pipeline can precompute it for the default range.
- **Why:** the rules require at least 2,000 draws and the wider of the independent and correlated intervals, because errors in mass products are correlated in time.
- **Rejected:** adding sigma analytically to the Sen interval (no closed form for a median of slopes).
- **Known limits:** quadrature adds measurement scatter that is already partly in the residuals, so the independent case is slightly conservative. Missing sigma at a valid value counts as 0 and is noted. Bounds-only sources (5-95%) must be converted to sigma by the caller: sigma = (upper - lower) / (2 x 1.645).

---

## D7 (M5). Years of data needed ("cannot tell yet")

- **Choice:** Weatherhead et al. (1998) detection time, generalised to the time step and the requested power:
  n* = [ (z_(1-alpha/2) + z_power) x sigma_N x sqrt(12/k) / |slope| x sqrt((1 + phi)/(1 - phi)) ]^(2/3) years,
  k = steps per year (12 monthly, 1 annual), sigma_N = SD of the deseasonalised, Sen-detrended residuals, phi = the headline test's bias-corrected lag-1 r. Default power 0.8, alpha 0.05 (z sum 2.80). With power 0.9 the factor is 3.24, Weatherhead's "3.3".
  Reported: total years needed, more years needed (rounded up), and the inputs.
- **Why:** analytic, instant in the browser, cited, and readable on a slide. Checked against the actual headline test by simulation (see `simulation-results.md`).
- **Rejected:** a simulation search inside the app (seconds per call for monthly data).
- **Known limits:** it is a "post-hoc power" estimate (Hoenig and Heisey 2001): it uses the current slope, which is uncertain exactly when the test is not significant. Show it as "about N more years if the current rate and noise continue", never as a forecast. The formula is for linear OLS; the headline Mann-Kendall test with its correction is slightly less powerful (calibration in the simulation table).
- **References:** Weatherhead et al. (1998), J. Geophys. Res. 103(D14), 17149-17161; Tiao et al. (1990).

## D8 (M10). Sea level is a level, not a running total
- **Decision:** `sea_level` and `sea_level_long` keep `kind: level`. The verdict reads "rose by about X mm/yr" with its interval; the "running total" caveat for cumulative series is not shown.
- **Why:** sea surface height is measured directly at each step; it is not the sum of a rate series, so its Mann-Kendall significance is not inflated the way a cumulative sum's is. There is no sea-level rate series to point to. (Departs from the CLAUDE.md wording that listed sea level as cumulative; M9 review S9.)
- **Known limits:** monthly sea level is strongly autocorrelated (ENSO, monsoon); the lag-1 effective sample size correction and the Hamed-Rao cross-check cover this. The Western tropical Pacific (p = 0.057) shows the correction doing its job.

## D9 (M10). Real-data aggregation choices
- **Temperature:** summer = June-August (Greenland) and December-February labelled by the year of its January (Antarctica), only complete summers; anomaly from the 1991-2020 mean of those summers. Region mean = area-weighted mean of MERRA-2 cells whose centre is inside the region outline.
- **Sea level:** area-weighted mean of NASA-SSH cells inside each sea polygon; monthly = mean of the weeks labelled in the month (at least 3), otherwise missing. No GIA, no subsidence.
- **Ice mass change rate:** annual mean of the 12 published monthly rate rows; years with fewer than 12 months left out; never recomputed by differencing.
- **Long records:** Frederikse et al. contributions converted from mm of sea level to Gt with 362 Gt = 1 mm (sign flipped so loss is negative).
- **Why:** each is the simplest rule that uses only the published values, never fills a gap and is written in the Data sources page so a judge can check it.
- **Checks against published values:** `docs/REAL_DATA.md` (global sea level 3.17 vs NASA indicator 3.20 mm/yr; 1900-2018 rate 1.56 mm/yr = Frederikse 2020; ITS_LIVE 1985-2021 loss 5,016 km2 vs about 5,000 published; record Greenland melt summers 2012 and 2019 among the warmest).
