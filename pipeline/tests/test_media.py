"""Describe-popup videos (`python -m pipeline media`). Needs the `media` group:
uv run --group media pytest pipeline/tests/test_media.py"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from pipeline.media import MediaError, clip_kind, clip_name


def test_clip_name_and_kind_come_from_data() -> None:
    assert clip_name("/media/anything_loop.webm") == "anything_loop"
    with pytest.raises(MediaError):
        clip_name("/media/x.mp4")
    assert clip_kind({"mapMode": "layer", "outlines": "o.topo.json"}) == "map"
    assert clip_kind({"mapMode": None, "outlines": "o.topo.json"}) == "outlines"
    assert clip_kind({"mapMode": None}) == "line"


@pytest.mark.slow
def test_media_command_writes_webm_and_mp4_per_variable(built: Path, tmp_path: Path) -> None:
    pytest.importorskip("imageio_ffmpeg")
    from pipeline.__main__ import main

    out = tmp_path / "media"
    out.mkdir()
    (out / "stale_loop.webm").write_bytes(b"old")  # files no variable asks for are removed
    assert main(["media", "--root", str(built), "--out", str(out)]) == 0

    variables = json.loads((built / "variables.json").read_text(encoding="utf-8"))
    names = {clip_name(v["describe"]["video"]) for v in variables if v.get("describe", {}).get("video")}
    assert names
    expected = {f"{n}{ext}" for n in names for ext in (".webm", ".mp4")}
    assert {p.name for p in out.iterdir()} == expected
    for name in expected:
        size = (out / name).stat().st_size
        assert 0 < size < 1.5 * 1024 * 1024, (name, size)
