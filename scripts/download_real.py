"""Download real datasets from NASA Earthdata into data/raw/ (M10, docs/REAL_DATA.md).

    uv run python scripts/download_real.py <dataset> [<dataset> ...] [--list] [--limit N]

Login comes from your Earthdata .netrc. On Windows earthaccess looks for `_netrc`, so if only
`%USERPROFILE%\\.netrc` exists, NETRC is pointed at it. The file is never read or printed here.
Files already on disk are skipped, so an interrupted download can simply be rerun.
"""

from __future__ import annotations

import argparse
import hashlib
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"

# name -> (earthaccess short name, raw folder, optional regex a granule's file name must match)
DATASETS: dict[str, tuple[str, Path, str | None]] = {
    "sea_level": ("NASA_SSH_REF_SIMPLE_GRID_V11", RAW / "sea_level", None),
    "gmsl_indicator": ("NASA_SSH_GMSL_INDICATOR", RAW / "sea_level", r"^NASA_SSH_GMSL_INDICATOR\.txt$"),  # current file only
    "recon_gmsl": ("JPL_RECON_GMSL", RAW / "recon_gmsl", None),
    "grace": ("TELLUS_GRAC-GRFO_MASCON_CRI_GRID_RL06.3_V4", RAW / "grace", None),
    "itslive": ("NSIDC-0793", RAW / "itslive", r"\.nc$"),  # skip the MP4 animations
}


def ensure_netrc() -> None:
    if os.environ.get("NETRC"):
        return
    home = Path.home()
    if not (home / "_netrc").exists() and (home / ".netrc").exists():
        os.environ["NETRC"] = str(home / ".netrc")


def sha256sums(folder: Path) -> None:
    lines = []
    for p in sorted(folder.iterdir()):
        if p.is_file() and p.name != "SHA256SUMS.txt":
            h = hashlib.sha256(p.read_bytes()).hexdigest()
            lines.append(f"{h} *{p.name}")
    (folder / "SHA256SUMS.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("datasets", nargs="+", choices=sorted(DATASETS))
    ap.add_argument("--list", action="store_true", help="only list granules (name, size), do not download")
    ap.add_argument("--limit", type=int, default=None, help="download at most N granules (testing)")
    ap.add_argument("--threads", type=int, default=6)
    args = ap.parse_args()

    ensure_netrc()
    import earthaccess

    auth = earthaccess.login(strategy="netrc")
    if not (auth and auth.authenticated):
        print("Earthdata login failed: check the .netrc file (machine urs.earthdata.nasa.gov ...)")
        return 1

    for name in args.datasets:
        short, folder, filt = DATASETS[name]
        results = earthaccess.search_data(short_name=short)
        print(f"{name}: {short}: {len(results)} granules", flush=True)
        if args.list:
            for g in results[:5]:
                links = g.data_links()
                print("  ", links[0].rsplit("/", 1)[-1] if links else "?", g.size, "MB")
            continue
        if filt:
            results = [g for g in results if g.data_links() and re.search(filt, g.data_links()[0].rsplit("/", 1)[-1])]
            print(f"  {len(results)} match {filt}", flush=True)
        if args.limit:
            results = results[: args.limit]
        folder.mkdir(parents=True, exist_ok=True)
        files = earthaccess.download(results, str(folder), threads=args.threads)
        print(f"{name}: {len(files)} files in {folder.relative_to(ROOT)}", flush=True)
        sha256sums(folder)
    return 0


if __name__ == "__main__":
    sys.exit(main())
