"""Synthetic data generator: a complete data contract tree with known injected trends.

`build_synthetic` and `BuildError` are loaded lazily: the build imports the ingest and
stand-in packages, which import synthetic.config/geometry, so an eager import here
would be circular.
"""

from typing import Any

from .config import DEFAULT_SEED

__all__ = ["DEFAULT_SEED", "BuildError", "build_synthetic"]


def __getattr__(name: str) -> Any:
    if name in ("BuildError", "build_synthetic"):
        from . import build
        return getattr(build, name)
    raise AttributeError(f"module 'pipeline.synthetic' has no attribute {name!r}")
