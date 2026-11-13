"""Command line: uv run python -m pipeline {validate,build,ingest,standin,media} ..."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

DEFAULT_ROOT = Path("data/public")


def _cmd_validate(args: argparse.Namespace) -> int:
    from .validate import validate

    result = validate(args.root, stats_check=not args.no_stats_check, display_root=args.root.as_posix())
    for problem in result.problems:
        print(problem)
    if args.no_stats_check:
        print("note: rule 6 stats parity skipped (--no-stats-check)", file=sys.stderr)
    print(result.summary())
    return 0 if result.ok else 1


def _cmd_build(args: argparse.Namespace) -> int:
    if not args.synthetic:
        print("build: only --synthetic is implemented (real data comes in M10)", file=sys.stderr)
        return 2
    from .synthetic import BuildError, build_synthetic

    try:
        build_synthetic(args.root, seed=args.seed)
    except BuildError as exc:
        print(f"build: {exc}", file=sys.stderr)
        return 1
    return 0


def _cmd_ingest(args: argparse.Namespace) -> int:
    from .ingest import IngestError, ingest_grace, ingest_imbie, ingest_itslive, ingest_recon, ingest_sea_level
    from .writers import BuildError

    try:
        if args.dataset == "sea_level":
            ingest_sea_level(args.raw, args.root)
        elif args.dataset == "recon_gmsl":
            ingest_recon(args.raw, args.root)
        elif args.dataset == "grace":
            ingest_grace(args.raw, args.root)
        elif args.dataset == "itslive":
            ingest_itslive(args.raw, args.root)
        else:
            ingest_imbie(args.raw, args.root)
    except (IngestError, BuildError, FileNotFoundError) as exc:
        print(f"ingest: {exc}", file=sys.stderr)
        return 1
    print(f"ingest: wrote {args.dataset} into {args.root.as_posix()}; run `python -m pipeline validate`")
    return 0


def _cmd_standin(args: argparse.Namespace) -> int:
    import json
    from datetime import date

    from .standin import write_imbie_standins, write_sea_level_standins
    from .synthetic.assemble import config_topo

    if args.dataset == "imbie":
        write_imbie_standins(args.out, args.seed, date_format=args.date_format)
        print(f"standin: IMBIE CSVs written to {args.out.as_posix()}")
        return 0
    topo = config_topo() if args.topo is None else json.loads(args.topo.read_text(encoding="utf-8"))
    first, last = date.fromisoformat(args.first), date.fromisoformat(args.last)
    paths = write_sea_level_standins(args.out, topo, args.seed, first, last)
    print(f"standin: {len(paths)} weekly grids + GMSL text written to {args.out.as_posix()}")
    return 0


def _cmd_media(args: argparse.Namespace) -> int:
    from .media import MediaError, build_media

    try:
        build_media(args.root, args.out)
    except (MediaError, FileNotFoundError) as exc:
        print(f"media: {exc}", file=sys.stderr)
        return 1
    return 0


def make_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python -m pipeline", description="Trend Detective data pipeline")
    sub = parser.add_subparsers(dest="command", required=True)

    p_val = sub.add_parser("validate", help="check data/public against the data contract")
    p_val.add_argument("--root", type=Path, default=DEFAULT_ROOT, help="data folder (default: data/public)")
    p_val.add_argument("--no-stats-check", action="store_true",
                       help="skip recomputing stats with the Node engine (rule 6 parity)")
    p_val.set_defaults(func=_cmd_validate)

    from .synthetic.config import DEFAULT_SEED

    p_build = sub.add_parser("build", help="write data/public (clears old generated content first)")
    p_build.add_argument("--synthetic", action="store_true", help="write synthetic data with injected trends")
    p_build.add_argument("--root", type=Path, default=DEFAULT_ROOT, help="output folder (default: data/public)")
    p_build.add_argument("--seed", type=int, default=DEFAULT_SEED,
                         help=f"random seed for --synthetic (default: {DEFAULT_SEED})")
    p_build.set_defaults(func=_cmd_build)

    p_ing = sub.add_parser("ingest", help="raw downloads (or stand-ins) -> contract files, overlaid on --root")
    p_ing.add_argument("dataset", choices=["sea_level", "imbie", "recon_gmsl", "grace", "itslive"],
                       help="sea_level: NASA-SSH V1.1 weekly grids (+ GMSL indicator cross-check); "
                            "imbie: IMBIE 2026 Gt CSVs -> ice_mass and ice_mass_rate; "
                            "recon_gmsl: JPL_RECON_GMSL -> sea_level_long and ice_mass_long; "
                            "grace: JPL mascons -> ice_mass_map layer; itslive: NSIDC-0793 -> ice_extent + outlines")
    p_ing.add_argument("--raw", type=Path, required=True, help="folder with the downloaded files")
    p_ing.add_argument("--root", type=Path, default=DEFAULT_ROOT, help="data tree to update (default: data/public)")
    p_ing.set_defaults(func=_cmd_ingest)

    p_si = sub.add_parser("standin", help="write synthetic stand-in raw files in the real layouts")
    p_si.add_argument("dataset", choices=["sea_level", "imbie"])
    p_si.add_argument("--out", type=Path, required=True, help="output folder (not data/public)")
    p_si.add_argument("--seed", type=int, default=DEFAULT_SEED)
    p_si.add_argument("--first", default="2020-01-06", help="sea_level: first weekly label (a Monday)")
    p_si.add_argument("--last", default="2020-03-30",
                      help="sea_level: last weekly label; about 2-3 MB per week as netCDF-3, so keep spans short")
    p_si.add_argument("--topo", type=Path, default=None, help="sea_level: regions.topo.json (default: from config)")
    p_si.add_argument("--date-format", choices=["iso", "decimal"], default="iso", help="imbie: Date column format")
    p_si.set_defaults(func=_cmd_standin)

    p_media = sub.add_parser("media", help="Describe-popup loop videos (needs `uv run --group media`)")
    p_media.add_argument("--root", type=Path, default=DEFAULT_ROOT, help="data folder (default: data/public)")
    p_media.add_argument("--out", type=Path, default=Path("media"), help="output folder (default: media)")
    p_media.set_defaults(func=_cmd_media)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = make_parser().parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
