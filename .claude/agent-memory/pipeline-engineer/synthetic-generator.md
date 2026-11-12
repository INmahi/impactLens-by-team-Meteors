---
name: synthetic-generator
description: M2c synthetic build facts (2026-11-12) - gate results, coverage per series, lowPower impossibility, atlas sizes, grid orientation choices
metadata:
  type: project
---

Synthetic generator lives in pipeline/synthetic (config.py holds REGIONS/VARIABLES/MAP_LAYERS as data). Default seed 20261112; never retune seed/noise to pass the gate (user rule via main).

Facts measured 2026-11-12:
- Default seed: all 17 injected slopes inside the 95% Sen interval. 50-seed coverage 0.948; weakest: temperature/antarctica 0.84, sea_level and sea_level_long 0.88 (phi 0.5-0.6). Sampling error ~±0.04.
- The engine's `lowPower` is `years < 30 || n < 30`; every period in plan section 2 is >= 45 years, so no series can be lowPower. "Noisy/low power" series = temperature/antarctica (power ~0.16-0.19 over seeds; default seed happens to be significant, p=0.017).
- Zero-slope series = ice_mass_rate/antarctica_east (detected 2% over seeds).
- Size: temperature atlases dominate (~9 MB each at 1-deg grid, scale 0.02 degC); data/public ~26 MB total. Scale only modestly affects PNG size (0.01->0.05 saves ~40%).
- Grid convention chosen (contract silent): row 0 = north edge, col 0 = -180. Polar-cap rings Natural Earth style, CCW planar; East Antarctica is a MultiPolygon split at 180.
- Full build ~47 s (compress_level 9); pytest suite ~2 min.
- M3 follow-up (2026-11-12): map noise was lon/lat-grid bilinear -> radial wedges at poles on the globe (temp spread 111% of range at 89.5). Now SmoothNoise = Gaussian kernel on Fibonacci-sphere nodes (3D chord distance), bumps use great-circle distance, temperature land term blurred on the sphere (crude land mask has a coast along 180 at 64.5N). Realistic 1-deg texture makes a strict "<2% polar spread every frame" impossible for temperature (needs ~25 deg kernel); measured max 5.5%, median ~1.6%, same as normal adjacent-cell differences. Tests use per-frame max <6%, median <2.5%, <=1.5x max meridional neighbour diff. Temperature atlases shrank to 12 MB total.

- Coastal seas (added 2026-11-12, 6 regions, kind coastal_sea, sea_level only): polygons ARE the real
  averaging polygons (0.5-deg NASA-SSH grid, cell centre in polygon), drawn ~100 km offshore per
  docs/datasets/sea-level-gridded-ssh.md; Mediterranean is a 3-part MultiPolygon (Adriatic/Aegean/Alboran
  too narrow for the buffer). Hand-drawn from memory, edges >= 84 km from my own coast reference; real
  build must confirm with the grid's valid mask. 0.5-deg cells: BoB 257, Gulf 350, US Atlantic 151,
  WTP 2098, North Sea 128, Med 248.
- M2 gate REDEFINED by main 2026-11-12 (single-seed "all inside" was invalid as series grew, 0.95^23 ~ 0.31):
  (a) default-seed misses <= binom.ppf(0.99, N, 0.05) (N=23 -> 4); (b) pooled 50-seed coverage in
  [0.93, 0.97], marked @slow (marker registered in tests/conftest.py, still runs by default).
  Default seed: 1 miss, sea_level/us_east_coast (inj 3.6, [3.057, 3.465]; chance, 0.96 over 200 seeds).
  Coverage 0.952 (1095/1150). Noise sd cannot flip a miss (error and width scale together); never tune.
- Compare demo (interval proxy until the M5 bootstrap test): gulf vs med disjoint; north_sea vs global
  both injected 3.3 (main's decision) and each interval holds the other's slope.
- Per-sea caveats live in regions.json `notes` (RegionSpec.notes); manifests carry display `name` (LayerSpec.name).

**Why:** these are the numbers main will ask about at the M2 gate and M10 swap.
**How to apply:** when real data replaces synthetic (M10), keep the same grid orientation and re-measure atlas sizes. Related: [[validator-conventions]], [[library-quirks]]
