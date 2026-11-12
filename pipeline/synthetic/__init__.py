"""Synthetic data generator: a complete data contract tree with known injected trends."""

from .build import BuildError, build_synthetic
from .config import DEFAULT_SEED

__all__ = ["DEFAULT_SEED", "BuildError", "build_synthetic"]
