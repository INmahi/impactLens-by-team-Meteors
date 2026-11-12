from __future__ import annotations

import shutil
from pathlib import Path

import pytest

from .contract_tree import build_tree


def pytest_configure(config: pytest.Config) -> None:
    config.addinivalue_line("markers", "slow: long-running (deselect with -m 'not slow'); runs by default")


@pytest.fixture(scope="session")
def template_tree(tmp_path_factory: pytest.TempPathFactory) -> Path:
    """Built once per session (one Node call for the stats)."""
    root = tmp_path_factory.mktemp("template") / "public"
    build_tree(root)
    return root


@pytest.fixture
def tree(template_tree: Path, tmp_path: Path) -> Path:
    """A fresh, writable copy of the valid tree for each test."""
    root = tmp_path / "public"
    shutil.copytree(template_tree, root)
    return root
