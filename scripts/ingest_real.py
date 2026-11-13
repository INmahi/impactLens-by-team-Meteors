"""Overlay every real source found in data/raw/ onto data/public/, then validate (`pnpm data:real`).

Runs after `pipeline build --synthetic`, so variables without real files stay synthetic (and say so).
Each dataset is ingested only if its raw folder exists and is not empty. See docs/REAL_DATA.md.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"

# dataset name for `pipeline ingest` -> raw folder
SOURCES = {
    "imbie": RAW / "imbie",
    "sea_level": RAW / "sea_level",
    "recon_gmsl": RAW / "recon_gmsl",
    "grace": RAW / "grace",
    "itslive": RAW / "itslive",
    "merra2": RAW / "merra2",
}


def run(*args: str) -> None:
    print("+", " ".join(args), flush=True)
    subprocess.run([sys.executable, "-m", "pipeline", *args], cwd=ROOT, check=True)


def main() -> int:
    done = []
    for name, folder in SOURCES.items():
        if folder.is_dir() and any(p.is_file() and p.name != "SHA256SUMS.txt" for p in folder.iterdir()):
            run("ingest", name, "--raw", str(folder))
            done.append(name)
        else:
            print(f"skip {name}: no files in {folder.relative_to(ROOT)}")
    run("validate")
    print("real sources:", ", ".join(done) or "none")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
