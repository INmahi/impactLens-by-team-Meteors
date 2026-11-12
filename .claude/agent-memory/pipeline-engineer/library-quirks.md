---
name: library-quirks
description: Pillow/jsonschema/Node quirks found while building the validator (16-bit PNG mode, uri format, NaN in json, TS stripping)
metadata:
  type: reference
---

- Pillow reports mode "RGBA" for 16-bit RGBA PNGs too. Bit depth must be read from the IHDR chunk (pipeline/validate/png.py does this). Pillow cannot write 16-bit RGBA; tests craft one with struct+zlib.
- jsonschema 4.26 FormatChecker skips "uri" unless rfc3987 is installed (it is not, and adding deps needs main). schemas.py registers a stdlib urlsplit fallback.
- Python json accepts NaN/Infinity by default; validator uses parse_constant to reject. Always write with allow_nan=False.
- Node 24 runs .ts directly (type stripping); a script under pipeline/ imports the engine as ../../packages/stats/src/index.ts. Root package.json has "type": "module", so top-level await works.
- analyzeTrend can return NaN/Infinity (degenerate series); JSON.stringify would turn them into null, so recompute_stats.ts writes them as strings "NaN"/"Infinity".

Related: [[validator-conventions]]
