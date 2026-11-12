"""Command line: uv run python -m pipeline {validate,build} ..."""

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
    print("build: not implemented yet (M2 part c)", file=sys.stderr)
    return 2


def make_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python -m pipeline", description="Trend Detective data pipeline")
    sub = parser.add_subparsers(dest="command", required=True)

    p_val = sub.add_parser("validate", help="check data/public against the data contract")
    p_val.add_argument("--root", type=Path, default=DEFAULT_ROOT, help="data folder (default: data/public)")
    p_val.add_argument("--no-stats-check", action="store_true",
                       help="skip recomputing stats with the Node engine (rule 6 parity)")
    p_val.set_defaults(func=_cmd_validate)

    p_build = sub.add_parser("build", help="write data/public (M2 part c)")
    p_build.add_argument("--synthetic", action="store_true", help="write synthetic data with injected trends")
    p_build.add_argument("--root", type=Path, default=DEFAULT_ROOT, help="output folder (default: data/public)")
    p_build.set_defaults(func=_cmd_build)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = make_parser().parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
