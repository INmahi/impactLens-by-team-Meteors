"""Download the NASA GIBS Blue Marble base map tiles the globe needs offline (`pnpm basemap`).

Saves BlueMarble_ShadedRelief_Bathymetry, EPSG:4326, TileMatrixSet 500m, zoom levels 0-5 for the whole globe
(1,073 JPEG tiles of 512 px) plus level 6 for the polar caps poleward of 58.5 degrees (the app's focus; rows 0-6 and
33-39, 1,120 tiles) to basemap/bluemarble/500m/<level>/<row>/<col>.jpeg. The app serves them at /basemap/ and always draws
them; levels 6-7 come from NASA GIBS only when the browser is online. GIBS needs no login.
Tiles already on disk are skipped, so an interrupted run can be repeated.
"""

from __future__ import annotations

import math
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "basemap" / "bluemarble" / "500m"
URL = ("https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/BlueMarble_ShadedRelief_Bathymetry/default/"
       "500m/{level}/{row}/{col}.jpeg")
MAX_LEVEL = 5
POLAR_LEVEL = 6
POLAR_ROWS = list(range(0, 7)) + list(range(33, 40))  # 4.5-degree rows poleward of 58.5 N / S (keep in step with engine.ts)
LEVEL0_TILE_DEG = 288.0  # same scheme as apps/web/src/globe/gibsTilingScheme.ts


def grid(level: int) -> tuple[int, int]:
    if level == 0:
        return 2, 1
    d = LEVEL0_TILE_DEG / 2**level
    return math.ceil(360 / d), math.ceil(180 / d)


def main() -> int:
    jobs = []
    for level in range(MAX_LEVEL + 1):
        nx, ny = grid(level)
        jobs += [(level, r, c) for r in range(ny) for c in range(nx)]
    nx, _ = grid(POLAR_LEVEL)
    jobs += [(POLAR_LEVEL, r, c) for r in POLAR_ROWS for c in range(nx)]
    session = requests.Session()
    session.headers["User-Agent"] = "TrendDetective-basemap"

    def fetch(job: tuple[int, int, int]) -> str:
        level, row, col = job
        out = OUT / str(level) / str(row) / f"{col}.jpeg"
        if out.exists() and out.stat().st_size > 0:
            return "skip"
        for _ in range(4):
            r = session.get(URL.format(level=level, row=row, col=col), timeout=60)
            if r.status_code == 200 and r.content[:2] == b"\xff\xd8":
                out.parent.mkdir(parents=True, exist_ok=True)
                out.write_bytes(r.content)
                return "ok"
        return f"fail {level}/{row}/{col} HTTP {r.status_code}"

    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(fetch, jobs))
    fails = [x for x in results if x.startswith("fail")]
    size = sum(p.stat().st_size for p in OUT.rglob("*.jpeg"))
    print(f"basemap: {results.count('ok')} downloaded, {results.count('skip')} on disk, {len(fails)} failed; "
          f"{len(jobs)} tiles, {size / 1e6:.1f} MB in {OUT.relative_to(ROOT)}")
    for f in fails[:10]:
        print(" ", f)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
