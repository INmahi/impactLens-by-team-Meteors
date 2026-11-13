# Wording for statistical results

Seed text for the verdicts the app shows. Owner: stats-lead. science-writer and main write the final copy; stats-lead reviews every user-facing change against this file.
Placeholders: `{A}`, `{B}` are region names from `regions.json` (never hard-coded), `{var}` the variable name, `{u}` its units, numbers formatted to the precision of the data.

## Rules for every result

1. **p-values:** `p < 0.001` below 0.001, otherwise two significant figures (`p = 0.031`). Use `formatP()` from `@trend/stats`.
2. **Not significant is never "no change".** Say "cannot tell yet" (one series) or "cannot tell these trends apart yet" (two). Never "no trend", "stable", "the same", "equal", "no difference".
3. **No cause from statistics.** Never "because", "due to", "caused by", "driven by", "proves", "explains" about a correlation, a sensitivity or a difference in trends. Allowed: "moved together", "went with", "was associated with", "is consistent with". Causes come only from cited science text (science-writer), never from our numbers.
4. **Antarctica:** never attribute Antarctic mass loss to air temperature, and never write "warm air is melting Antarctica". Antarctic loss is mainly ocean-driven (warm water thinning West Antarctic glaciers). A temperature correlation or sensitivity for Antarctica must carry that sentence.
5. **Sea level:** regional values are "satellite sea level averaged over the {A} area", never the value at a town or harbour, and never the rise people feel on land (land sinking is not included). The global mean is never presented as a local value.
6. **Always give the interval** with a rate: "3.9 mm/yr (95% interval 3.4 to 4.4)".
7. **Short records** (`lowPower`): if the result is not significant, add "With only {N} years of data, a real {trend|difference} could still be missed." If it is significant, add instead "With only {N} years of data, the size of this trend is uncertain; a few unusual years can move it." (A significant result must never be followed by "could still be missed"; M9 review S3.)
8. **Synthetic data:** "SYNTHETIC DATA" stays visible whenever `synthetic` is true; never quote synthetic numbers as findings.
9. **Rate series:** a trend in a rate is a speed-up or slow-down ("acceleration"); never call it "the rate".
10. **Cumulative series:** the slope is the "average rate over {start}-{end}"; point to the rate series for speed-up.

## Compare two regions (`CompareReport.verdict`)

"Faster" compares the absolute size of the two slopes when they have the same sign. Choose the verb from the sign: rising (positive) or falling / losing (negative).

| verdict | Headline | Detail line |
|---|---|---|
| `a_faster` | "{A} is {rising/falling} faster than {B}." | "{slopeA} vs {slopeB} {u}/yr, {start}-{end}. Difference {d} {u}/yr (95% interval {lo} to {hi}), {p}." |
| `b_faster` | "{B} is {rising/falling} faster than {A}." | same, with the difference written as B minus A if that reads better (flip sign and interval together) |
| `different_directions` | "{A} is {rising} while {B} is {falling}." | same detail line |
| `cannot_tell_apart` | "Cannot tell these two trends apart yet." | "{A} {slopeA} and {B} {slopeB} {u}/yr; the difference ({d}, 95% interval {lo} to {hi}) could be zero." |

Always add, in the notes area:
- "Trends are compared, not levels: each region's series has its own zero."
- "A difference in trends does not by itself say why the two differ."
- When `crossCheck.agrees` is false: "The cross-check disagrees; treat this as borderline."

**Rate series (ice mass loss rate):** both slopes are accelerations. `a_faster` with both negative reads: "{A}'s ice loss is speeding up faster than {B}'s." `cannot_tell_apart`: "Cannot tell yet whether {A}'s loss is speeding up faster than {B}'s."

**Sea level, coastal sea against the global mean:** "Sea level averaged over the {A} area rose faster than the global mean: {slopeA} vs {slopeB} mm/yr." For seas with a subsidence note in `regions.json` (for example the Bay of Bengal), add: "Land sinking is not included, so the rise felt on the coast is larger." Never "{town} is sinking/flooding faster".

**Do not write:** "{A} and {B} rise at the same rate", "no significant difference means they are equal", "{A} is X% more at risk", "because {A} is warmer", "the global mean in {A}".

## Two variables: correlation (`CorrelationReport`)

- **Detrended significant:** "After removing both trends, the year-to-year ups and downs of {X} and {Y} move together (r = {r}, {p}, about {nEff} independent points). This does not show that one causes the other."
- **Raw significant, detrended not:** "{X} and {Y} both trend over the record, so they look correlated (r = {r_raw}). After removing the trends, their year-to-year changes are not significantly related: cannot tell yet."
- **Neither:** "No clear link between {X} and {Y} in this record: cannot tell yet."
- **Lag scan:** "The strongest link is with {Y} {k} years after {X} (r = {r}, adjusted {pAdj}). {K} lags were tried." Only report a lag as notable if its adjusted p is below 0.05.
- The raw correlation is never the headline number.

## Sensitivity (`SensitivityReport`)

- **Greenland, detrended significant:** "In years when Greenland's summer was warmer than its trend, ice loss tended to be higher: about {b} Gt/yr per deg C (95% interval {lo} to {hi})." Do not write "1 deg C of warming causes {b} Gt/yr of loss".
- **Levels:** "Across {start}-{end}, warmer summers went with faster loss: {b} Gt/yr per deg C. Part of this comes from both series trending."
- **Antarctica (any result):** add "Antarctic ice loss is driven mainly by warm ocean water reaching West Antarctic glaciers; this association with air temperature is not a melt mechanism."

## Source uncertainty (`UncertaintyReport`)

- "Including the uncertainty stated by the source, the rate is {slope} {u}/yr (95% interval {lo} to {hi})."
- `widening` under 0.05: "The source's stated uncertainty barely changes this."
- `widening` 0.05-1: "That is {pct}% wider than the fit alone."
- `widening` 1 or more: "That is about {x} times as wide as the fit alone: the source's stated uncertainty, not the year-to-year scatter, limits how well this rate is known."
- `combined.model = 'correlated'`: "Errors that persist over time matter most here."

## Years of data needed (`DetectabilityReport`, shown only when not significant)

- "Cannot tell yet. If the current rate ({slope} {u}/yr) and the year-to-year noise continue, about {moreYears} more years of data would give an 80% chance of detecting it. This is a rough guide, not a forecast."
- `moreYears = 0` while not significant: "By the usual rule of thumb this record should be long enough; the trend may be weaker than the current estimate."
- `moreYears = null`: "The current slope is zero, so we cannot estimate how long it would take."
- **Do not write:** "the trend will be significant in {N} years", "{N} years until {X} happens", or any statement about the future value of the variable.
