---
name: validator-conventions
description: Interpretations the validator (M2b, 2026-11-12) enforces beyond the literal README rules; the generator and real builds must follow them
metadata:
  type: project
---

Choices made in pipeline/validate/checks.py where the contract README was silent or ambiguous (reported to main 2026-11-12; check whether main changed the contract since):
- Global region = `kind == "global"` (kind became required in the schema, 2026-11-12). Global regions must NOT have a geometry; any other region must.
- variables.json `period` must equal [min periods start, max periods end] (reported as rule 5).
- Segments must be contiguous on the date grid: first start = dates[0], last end = dates[-1], next.start = step after prev.end.
- Unexpected files anywhere (root, series/, stats/, frames/ not in atlases, stray folders, unreferenced outlines, layer folders no variable uses as mapMode) are rule 3 problems.
- PNG atlases/colormap: 8-bit colour type 6 (RGBA) only; iCCP/sRGB/gAMA/cHRM chunks are flagged. Pillow's default save writes none.
- Stats parity calls analyzeTrend with {dates, values, frequency, kind} only (default alpha, no start/end).
- Topology geometry is checked: arc indices, closed rings, lon/lat in range (after transform decoding).

**Why:** README rules leave these open; picking strict readings keeps data honest (no padding, no silent splices).
**How to apply:** Generator (M2c) must write stats via `pipeline.validate.run_analyze` + `stats_file_content`, use Pillow RGBA saves, and set kind on every region. Related: [[library-quirks]]
