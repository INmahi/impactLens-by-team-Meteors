from __future__ import annotations

import shutil
from pathlib import Path

import pytest

from .contract_tree import build_tree


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
