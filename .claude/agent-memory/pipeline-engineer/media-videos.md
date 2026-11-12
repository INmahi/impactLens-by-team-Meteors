---
name: media-videos
description: M9b Describe-popup loop videos (2026-11-13) - pipeline/media.py, clip-kind rule, encoder settings, sizes, test needs media group
metadata:
  type: project
---

- `uv run --group media python -m pipeline media [--root] [--out media]` (~10 s for 7 variables). Names come
  from variables.json `describe.video` stems; stale *.webm/*.mp4 in --out are deleted.
- Clip kind from data: mapMode -> map (atlas frames binned to <=108 means, so labels show the bin's last
  month); outlines -> outlines with earliest as ghost; else -> line chart of top-level non-coastal regions.
  All loop via 12-frame hold + 8-frame crossfade to frame 0. 640x360, 12 fps, ~10.7 s.
- VP9 crf 38 / x264 crf 27 slow: synthetic clips are 20-270 KB (temperature biggest). Real data will be
  noisier/larger; still far under the 1.5 MB budget.
- Default pytest groups lack imageio-ffmpeg: the slow test importorskips it; run with `uv run --group media pytest`.

**Why:** M10 real data swap reruns this; sizes and the bin-label caveat are what main will ask about.
**How to apply:** rerun media after every data rebuild. Related: [[synthetic-generator]]
