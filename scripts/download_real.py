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
    # MERRA-2 monthly: only T2M is fetched through NASA's OPeNDAP service (~0.5 MB a month, not 50-75 MB).
    "merra2": ("M2TMNXSLV", RAW / "merra2", None),
    # GPM IMERG monthly V07 (M12): only precipitation over a box around Bangladesh, via OPeNDAP (~30 KB a month).
    "imerg": ("GPM_3IMERGM", RAW / "imerg", None),
}
# IMERG 0.1-degree grid: lon index (lon + 179.95) / 0.1, lat index (lat + 89.95) / 0.1; dims (time, lon, lat).
# Box 87.95-92.95 E, 20.45-26.85 N covers Bangladesh (Natural Earth bounds 88.02-92.63 E, 20.79-26.57 N).
IMERG_VARS = "dap4.ce=/Grid/precipitation[0:1:0][2679:1:2729][1104:1:1168];/Grid/lat[1104:1:1168];/Grid/lon[2679:1:2729];/Grid/time"
MERRA2_VERSION = "5.12.4"
MERRA2_VARS = "dap4.ce=/T2M;/lat;/lon;/time"


def download_merra2(earthaccess, folder: Path, limit: int | None, threads: int,
                    short: str = "M2TMNXSLV", version: str = MERRA2_VERSION, ce: str = MERRA2_VARS,
                    suffix: tuple[str, str] = (".nc4", ".T2M.nc4"), label: str = "merra2") -> int:
    """One subset netCDF-4 per granule via OPeNDAP (the granule's own OPENDAP link). Skips files on disk.
    Used for MERRA-2 (T2M only) and IMERG (Bangladesh box only)."""
    from concurrent.futures import ThreadPoolExecutor

    results = earthaccess.search_data(short_name=short, version=version)
    print(f"{label}: {short} {version}: {len(results)} granules", flush=True)
    jobs = []
    for g in results[:limit] if limit else results:
        url = next((u["URL"] for u in g["umm"].get("RelatedUrls", []) if u.get("Subtype") == "OPENDAP DATA"), None)
        name = g.data_links()[0].rsplit("/", 1)[-1]
        name = name[: -len(suffix[0])] + suffix[1] if name.endswith(suffix[0]) else name + suffix[1]
        if url is None:
            raise SystemExit(f"{label}: no OPeNDAP link for {name}")
        jobs.append((url + ".dap.nc4?" + ce, folder / name))
    folder.mkdir(parents=True, exist_ok=True)
    session = earthaccess.get_requests_https_session()

    def fetch(job: tuple[str, Path]) -> str:
        url, out = job
        if out.exists() and out.stat().st_size > 5_000:
            return "skip"
        for attempt in range(4):
            r = session.get(url, timeout=300)
            if r.status_code == 200 and r.content[1:4] == b"HDF":  # netCDF-4 = HDF5 signature
                tmp = out.with_suffix(".part")
                tmp.write_bytes(r.content)
                tmp.replace(out)
                return "ok"
        raise RuntimeError(f"{out.name}: HTTP {r.status_code} after 4 tries")

    with ThreadPoolExecutor(max_workers=threads) as pool:
        done = list(pool.map(fetch, jobs))
    print(f"{label}: {done.count('ok')} downloaded, {done.count('skip')} already on disk", flush=True)
    return len(jobs)


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
        if name == "merra2" and not args.list:
            download_merra2(earthaccess, folder, args.limit, args.threads)
            sha256sums(folder)
            continue
        if name == "imerg" and not args.list:
            download_merra2(earthaccess, folder, args.limit, args.threads, short="GPM_3IMERGM", version="07",
                            ce=IMERG_VARS, suffix=(".HDF5", ".BD.nc4"), label="imerg")
            sha256sums(folder)
            continue
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
