# Demo cases

Owner: science-writer (rewritten by main on 2026-11-13 for the real data). Three short scripts for the live demo and video.

**All numbers below are from the real data now in the app** (IMBIE 2026, NASA-SSH V1.1, NASA MERRA-2; downloaded 2026-11-13). Re-check them in the app before recording: they change if a dataset is updated. Wording follows `docs/stats/wording.md`: every rate with its 95% interval, "cannot tell yet" (never "no change"), no cause claimed from a trend or a correlation.

## 1. Bay of Bengal: rising clearly, but is it faster than the world?

Clicks: Variable **Sea level** -> Region **Bay of Bengal (northern)** -> **Run analysis**. Then switch **Compare mode** on -> **Another region** -> **Global** -> **Run analysis**.

Say: "This is satellite sea level averaged over the open northern Bay of Bengal, at least about 100 km offshore, not the value at any town. Since 1992 it has risen about 4.1 mm a year (95% interval 2.8 to 5.5), and a trend this strong would be very unlikely if there were no real trend. Is that faster than the world? The global mean rose about 3.2 mm a year. The Bay's number is higher, but its monsoon swings are large, so with 34 years the app cannot tell the two trends apart yet (p = 0.16). That does not mean they are the same. And land sinking in the Ganges-Brahmaputra delta is not in this satellite number, so the rise people feel on the coast is larger."

(Expected: single sea 4.10 mm/yr, 95% interval 2.77 to 5.46, p < 0.001. Compare: difference 0.94 mm/yr, 95% interval -0.38 to 2.25, p = 0.16, "Cannot tell these two trends apart yet".)

## 2. Greenland vs Antarctica: same loss, different story

Clicks: Variable **Ice mass** -> Region **Greenland** -> **Run analysis**; Region **Antarctica** -> **Run analysis**. Then Variable **Ice mass change rate** for each, then **Summer air temperature** for each.

Say: "Both ice sheets have lost about 110 gigatonnes a year on average since records began (Greenland about 112, Antarctica about 114). But look at the details. Greenland's loss is speeding up, by about 6 gigatonnes a year every year, and its summer air has warmed about 0.2 degrees per decade. Antarctica's speed-up and its summer air temperature: the app cannot tell yet. That fits published science: Greenland loses ice through summer surface melt and fast glaciers, while Antarctica loses it mainly where warm ocean water thins West Antarctic glaciers; most of its surface stays below freezing. The trends tell us what changed, not why; the why comes from those studies."

(Expected: ice mass Greenland -112 Gt/yr (-154 to -67), Antarctica -114 Gt/yr (-138 to -91), both p < 0.001. Rate: Greenland -6.15 Gt/yr per year (-11.7 to -1.66), p = 0.028; Antarctica -3.91 (-8.43 to 1.43), p = 0.12, cannot tell yet. Summer air: Greenland +0.022 C/yr (0.005 to 0.039), p = 0.008; Antarctica -0.012 C/yr (-0.031 to 0.009), p = 0.32, cannot tell yet.)

Sources: [IMBIE Team 2020, Greenland](https://doi.org/10.1038/s41586-019-1855-2); [IMBIE Team 2018, Antarctica](https://doi.org/10.1038/s41586-018-0179-y).

## 3. "Cannot tell yet" is an honest answer

Clicks: Variable **Sea level** -> Region **Western tropical Pacific** -> **Run analysis**.

Say: "Here the estimate is the highest of all our seas, about 4.6 mm a year, but the interval runs from slightly below zero to about 9.5. El Nino and La Nina push this sea up and down by a lot, so 34 years are not enough to be sure: the app says cannot tell yet. It does not say nothing is changing. The 'more years needed' line estimates how much longer the record must be."

(Expected: 4.61 mm/yr, 95% interval -0.19 to 9.46, p = 0.057, "Cannot tell yet whether this is changing".)

Optional short-range version: Variable **Summer air temperature** -> Region **Greenland** -> drag the range to about 10 years -> **Run analysis**. Check that the low-power badge and "With only N years of data, a real trend could still be missed" appear.
