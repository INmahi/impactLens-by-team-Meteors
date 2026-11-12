"""Describe-popup loop videos: `uv run --group media python -m pipeline media`.

For every variable in variables.json with a `describe.video` path ("/media/<name>.webm") this writes
<out>/<name>.webm (VP9) and <out>/<name>.mp4 (H.264, faststart), both yuv420p, 640x360, no audio.

The clip kind comes from the data, never from variable ids:
  * variable has `mapMode`  -> the map layer's atlas frames (decoded per the contract) animated;
  * variable has `outlines` -> the dated outlines drawn one by one over the earliest as a ghost;
  * otherwise               -> its series drawn progressively as a line chart (with the uncertainty band).
Every clip ends with a short hold and a crossfade back to its first frame so it loops cleanly, and shows
"SYNTHETIC DATA" whenever the variable is synthetic.
"""

from __future__ import annotations

import json
import math
import subprocess
from collections.abc import Callable
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

W, H = 640, 360
FPS = 12
MAIN_FRAMES = 108  # ~9 s of animation
HOLD_FRAMES = 12  # 1 s on the final state
FADE_FRAMES = 8  # crossfade back to the first frame (clean loop)

BG = (11, 16, 32)
FG = (230, 234, 242)
MUTED = (150, 160, 180)
AMBER = (255, 190, 60)
NODATA = (44, 48, 58)
LINE_COLOURS = [(90, 200, 250), (255, 140, 90), (160, 220, 120), (220, 140, 230)]


class MediaError(RuntimeError):
    pass


def _font(size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.load_default(size=size)


def _load(path: Path) -> object:
    return json.loads(path.read_text(encoding="utf-8"))


def clip_name(video: str) -> str:
    """'/media/ice_mass_loop.webm' -> 'ice_mass_loop'."""
    p = Path(video)
    if p.suffix != ".webm":
        raise MediaError(f"describe.video must end in .webm: {video!r}")
    return p.stem


def clip_kind(variable: dict) -> str:
    if variable.get("mapMode"):
        return "map"
    if variable.get("outlines"):
        return "outlines"
    return "line"


# --------------------------------------------------------------------------- shared drawing


def _chrome(img: Image.Image, title: str, date_label: str, synthetic: bool) -> None:
    d = ImageDraw.Draw(img)
    d.text((14, 8), title, fill=FG, font=_font(16))
    f = _font(18)
    tw = d.textlength(date_label, font=f)
    d.rectangle((W - tw - 26, 5, W - 6, 31), fill=(0, 0, 0))
    d.text((W - tw - 16, 7), date_label, fill=FG, font=f)
    if synthetic:
        f = _font(13)
        label = "SYNTHETIC DATA"
        tw = d.textlength(label, font=f)
        d.rectangle((W - tw - 20, H - 24, W - 6, H - 5), fill=(60, 40, 0))
        d.text((W - tw - 13, H - 22), label, fill=AMBER, font=f)


def _fmt(v: float) -> str:
    if v == 0:
        return "0"
    a = abs(v)
    if a >= 100:
        return f"{v:,.0f}"
    if a >= 1:
        return f"{v:.1f}".rstrip("0").rstrip(".")
    return f"{v:.2f}"


def _decode_topo_arcs(topo: dict) -> list[np.ndarray]:
    arcs = [np.asarray(a, dtype=float) for a in topo["arcs"]]
    tr = topo.get("transform")
    if tr:
        sx, sy = tr["scale"]
        tx, ty = tr["translate"]
        arcs = [np.cumsum(a, axis=0) * [sx, sy] + [tx, ty] for a in arcs]
    return arcs


def _rings(geom: dict, arcs: list[np.ndarray]) -> list[np.ndarray]:
    def ring(idx: list[int]) -> np.ndarray:
        parts = []
        for i in idx:
            a = arcs[i] if i >= 0 else arcs[~i][::-1]
            parts.append(a if not parts else a[1:])
        return np.concatenate(parts)

    if geom["type"] == "Polygon":
        return [ring(r) for r in geom["arcs"]]
    if geom["type"] == "MultiPolygon":
        return [ring(r) for poly in geom["arcs"] for r in poly]
    return []


# --------------------------------------------------------------------------- frame timing


def _loop(frames: list[np.ndarray]) -> list[np.ndarray]:
    last, first = frames[-1].astype(np.float32), frames[0].astype(np.float32)
    out = list(frames) + [frames[-1]] * HOLD_FRAMES
    for k in range(1, FADE_FRAMES + 1):
        t = k / (FADE_FRAMES + 1)
        out.append(np.rint(last * (1 - t) + first * t).astype(np.uint8))
    return out


# --------------------------------------------------------------------------- map clips


def _map_frames(root: Path, var: dict, regions: dict[str, dict], topo: dict) -> list[np.ndarray]:
    layer = var["mapMode"]
    man = _load(root / layer / "manifest.json")
    enc, grid = man["encoding"], man["grid"]
    lo, hi = man["valueRange"]
    units = man.get("units", var.get("units", ""))
    cmap = np.asarray(Image.open(root / layer / "colormap.png").convert("RGB"))[0]  # 256x3
    atlases = [np.asarray(Image.open(root / layer / a["file"]).convert("RGBA")) for a in man["atlases"]]

    def decode(fr: dict) -> np.ndarray:
        px = atlases[fr["atlas"]][fr["y"]:fr["y"] + fr["h"], fr["x"]:fr["x"] + fr["w"]]
        v = (px[..., 0].astype(np.float64) * 256 + px[..., 1]) * enc["scale"] + enc["offset"]
        return np.where(px[..., 2] == 255, v, np.nan)

    # Map area: equirectangular, 2:1, grid bbox -> pixels (nearest-neighbour sampling only).
    mx0, my0, mw, mh = 40, 36, 560, 270
    gw, gh = grid["width"], grid["height"]
    rows = np.minimum((np.arange(mh) + 0.5) * gh / mh, gh - 1).astype(int)
    cols = np.minimum((np.arange(mw) + 0.5) * gw / mw, gw - 1).astype(int)
    bx0, by0, bx1, by1 = grid["bbox"]

    # Static layer: background, region outlines of this variable, colour bar.
    base = Image.new("RGB", (W, H), BG)
    overlay = Image.new("RGBA", (mw, mh), (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    arcs = _decode_topo_arcs(topo)
    for g in topo["objects"]["regions"]["geometries"]:
        if g.get("id") not in var["regions"]:
            continue
        for r in _rings(g, arcs):
            xs = (r[:, 0] - bx0) / (bx1 - bx0) * mw
            ys = (by1 - r[:, 1]) / (by1 - by0) * mh
            od.line(list(zip(xs.tolist(), ys.tolist())), fill=(255, 255, 255, 170), width=1)
    d = ImageDraw.Draw(base)
    cb_x0, cb_x1, cb_y = 60, 430, 318
    bar = cmap[np.linspace(0, 255, cb_x1 - cb_x0).astype(int)]
    base.paste(Image.fromarray(np.repeat(bar[None], 10, axis=0)), (cb_x0, cb_y))
    f = _font(12)
    for val, x in ((lo, cb_x0), ((lo + hi) / 2, (cb_x0 + cb_x1) / 2), (hi, cb_x1)):
        s = _fmt(val)
        d.text((x - d.textlength(s, font=f) / 2, cb_y + 13), s, fill=MUTED, font=f)
    d.text((cb_x1 + 12, cb_y - 2), units, fill=FG, font=f)

    # Average consecutive source frames into at most MAIN_FRAMES bins (no seasonal strobing).
    frames = man["frames"]
    bins = [b for b in np.array_split(np.arange(len(frames)), min(MAIN_FRAMES, len(frames))) if len(b)]
    title = f"{var['name']} - {man.get('name', layer)}" if len(var["name"]) < 30 else var["name"]
    out = []
    for b in bins:
        stack = np.stack([decode(frames[i]) for i in b])
        valid = np.isfinite(stack).any(axis=0)
        mean = np.where(valid, np.nanmean(np.where(np.isfinite(stack), stack, 0), axis=0) * len(b)
                        / np.maximum(np.isfinite(stack).sum(axis=0), 1), np.nan)
        idx = np.clip(np.rint((mean - lo) / (hi - lo) * 255), 0, 255)
        rgb = np.where(valid[..., None], cmap[np.nan_to_num(idx).astype(int)], np.array(NODATA, np.uint8))
        rgb = rgb[rows][:, cols].astype(np.uint8)
        img = base.copy()
        map_img = Image.fromarray(rgb).convert("RGBA")
        map_img.alpha_composite(overlay)
        img.paste(map_img.convert("RGB"), (mx0, my0))
        _chrome(img, title[:60], frames[b[-1]]["date"], bool(var.get("synthetic")))
        out.append(np.asarray(img))
    return out


# --------------------------------------------------------------------------- outline clips


def _outline_frames(root: Path, var: dict, regions: dict[str, dict]) -> list[np.ndarray]:
    topo = _load(root / var["outlines"])
    arcs = _decode_topo_arcs(topo)
    by_date: dict[str, list[np.ndarray]] = {}
    for obj in topo["objects"].values():
        for g in obj["geometries"]:
            by_date.setdefault(g["properties"]["date"], []).extend(_rings(g, arcs))
    dates = sorted(by_date)
    if not dates:
        raise MediaError(f"{var['outlines']}: no dated outlines")
    allpts = np.concatenate([r for rs in by_date.values() for r in rs])
    lon0, lon1 = allpts[:, 0].min(), allpts[:, 0].max()
    lat0, lat1 = allpts[:, 1].min(), allpts[:, 1].max()
    k = math.cos(math.radians((lat0 + lat1) / 2))
    ax0, ay0, aw, ah = 20, 40, 600, 290
    s = min(aw / ((lon1 - lon0) * k), ah / (lat1 - lat0)) * 0.95
    cx, cy = ax0 + aw / 2, ay0 + ah / 2
    mlon, mlat = (lon0 + lon1) / 2, (lat0 + lat1) / 2

    def proj(r: np.ndarray) -> list[tuple[float, float]]:
        return list(zip((cx + (r[:, 0] - mlon) * k * s).tolist(), (cy - (r[:, 1] - mlat) * s).tolist()))

    # Optional area label from the variable's first region series (mean of that year's values).
    area: dict[str, float] = {}
    if var.get("regions"):
        sp = root / var["id"] / "series" / f"{var['regions'][0]}.json"
        if sp.exists():
            ser = _load(sp)
            acc: dict[str, list[float]] = {}
            for dt, v in zip(ser["dates"], ser["values"]):
                if v is not None:
                    acc.setdefault(dt[:4], []).append(v)
            area = {y: sum(v) / len(v) for y, v in acc.items()}

    base = Image.new("RGBA", (W, H), BG + (255,))
    bd = ImageDraw.Draw(base)
    for r in by_date[dates[0]]:
        bd.polygon(proj(r), fill=(120, 130, 150, 255), outline=(170, 180, 200, 255))
    f = _font(12)
    bd.rectangle((14, H - 22, 26, H - 10), fill=(120, 130, 150))
    bd.text((32, H - 24), f"{dates[0]} outline", fill=MUTED, font=f)
    bd.rectangle((150, H - 22, 162, H - 10), fill=(90, 200, 250))
    bd.text((168, H - 24), "outline in the year shown", fill=MUTED, font=f)

    per = max(1, round(MAIN_FRAMES / len(dates)))
    out = []
    for dt in dates:
        layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        ld = ImageDraw.Draw(layer)
        for r in by_date[dt]:
            ld.polygon(proj(r), fill=(90, 200, 250, 110), outline=(200, 240, 255, 255))
        for r in by_date[dates[0]]:  # ghost edge stays visible on top of the current outline
            ld.line(proj(r) + proj(r)[:1], fill=(170, 180, 200, 200), width=1)
        img = base.copy()
        img.alpha_composite(layer)
        img = img.convert("RGB")
        if dt[:4] in area:
            ImageDraw.Draw(img).text((14, 30), f"area {area[dt[:4]]:,.0f} {var.get('units', '')}",
                                     fill=MUTED, font=f)
        _chrome(img, var["name"], dt, bool(var.get("synthetic")))
        out.extend([np.asarray(img)] * per)
    return out


# --------------------------------------------------------------------------- line-chart clips


def _decimal_year(d: str) -> float:
    if len(d) == 4:
        return int(d) + 0.5
    y, m = d.split("-")[:2]
    return int(y) + (int(m) - 0.5) / 12


def _nice_step(span: float, target: int) -> float:
    raw = span / max(target, 1)
    mag = 10 ** math.floor(math.log10(raw))
    for m in (1, 2, 2.5, 5, 10):
        if raw <= m * mag:
            return m * mag
    return 10 * mag


def _line_frames(root: Path, var: dict, regions: dict[str, dict]) -> list[np.ndarray]:
    # Top-level, non-coastal regions (global mean, whole ice sheets); fall back to the first region.
    ids = [r for r in var["regions"]
           if regions.get(r, {}).get("parent") is None and regions.get(r, {}).get("kind") != "coastal_sea"]
    ids = (ids or var["regions"][:1])[: len(LINE_COLOURS)]
    series = []
    for rid in ids:
        s = _load(root / var["id"] / "series" / f"{rid}.json")
        t = np.array([_decimal_year(d) for d in s["dates"]])
        v = np.array([np.nan if x is None else x for x in s["values"]], dtype=float)
        if "lower" in s and "upper" in s:
            lo = np.array([np.nan if x is None else x for x in s["lower"]], dtype=float)
            hi = np.array([np.nan if x is None else x for x in s["upper"]], dtype=float)
        elif "sigma" in s:
            sg = np.array([np.nan if x is None else x for x in s["sigma"]], dtype=float)
            lo, hi = v - sg, v + sg
        else:
            lo = hi = None
        series.append((regions.get(rid, {}).get("name", rid), t, v, lo, hi))

    t0 = min(s[1].min() for s in series)
    t1 = max(s[1].max() for s in series)
    vals = np.concatenate([np.concatenate([s[2]] + [b for b in s[3:] if b is not None]) for s in series])
    vmin, vmax = np.nanmin(vals), np.nanmax(vals)
    pad = (vmax - vmin) * 0.05 or 1.0
    vmin, vmax = vmin - pad, vmax + pad
    px0, px1, py0, py1 = 70, 615, 44, 305

    def X(t: np.ndarray) -> np.ndarray:
        return px0 + (t - t0) / (t1 - t0) * (px1 - px0)

    def Y(v: np.ndarray) -> np.ndarray:
        return py1 - (v - vmin) / (vmax - vmin) * (py1 - py0)

    base = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(base)
    f = _font(12)
    ys = _nice_step(vmax - vmin, 5)
    for yv in np.arange(math.ceil(vmin / ys) * ys, vmax, ys):
        y = float(Y(np.array(yv)))
        d.line((px0, y, px1, y), fill=(35, 42, 62))
        lab = _fmt(float(yv))
        d.text((px0 - 6 - d.textlength(lab, font=f), y - 7), lab, fill=MUTED, font=f)
    xs = _nice_step(t1 - t0, 6)
    for xv in np.arange(math.ceil(t0 / xs) * xs, t1 + 1e-9, xs):
        x = float(X(np.array(xv)))
        d.line((x, py1, x, py1 + 4), fill=MUTED)
        lab = f"{xv:.0f}"
        d.text((x - d.textlength(lab, font=f) / 2, py1 + 6), lab, fill=MUTED, font=f)
    d.line((px0, py0, px0, py1), fill=MUTED)
    d.line((px0, py1, px1, py1), fill=MUTED)
    d.text((14, 28), var.get("units", ""), fill=FG, font=f)
    lx = px0
    for i, (name, *_rest) in enumerate(series):
        c = LINE_COLOURS[i]
        d.rectangle((lx, H - 22, lx + 12, H - 12), fill=c)
        d.text((lx + 18, H - 25), name, fill=MUTED, font=f)
        lx += 30 + d.textlength(name, font=f)
    if any(s[3] is not None for s in series):
        d.text((lx, H - 25), "(band: source uncertainty)", fill=MUTED, font=f)

    def runs(mask: np.ndarray) -> list[np.ndarray]:
        idx = np.flatnonzero(mask)
        return [r for r in np.split(idx, np.flatnonzero(np.diff(idx) > 1) + 1) if len(r)]

    out = []
    for i in range(MAIN_FRAMES):
        tend = t0 + (i + 1) / MAIN_FRAMES * (t1 - t0)
        img = base.copy().convert("RGBA")
        band = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        bdraw = ImageDraw.Draw(band)
        for k, (_n, t, v, lo, hi) in enumerate(series):
            c = LINE_COLOURS[k]
            shown = t <= tend
            if lo is not None:
                for r in runs(shown & np.isfinite(lo) & np.isfinite(hi)):
                    if len(r) > 1:
                        pts = list(zip(X(t[r]).tolist(), Y(hi[r]).tolist()))
                        pts += list(zip(X(t[r][::-1]).tolist(), Y(lo[r][::-1]).tolist()))
                        bdraw.polygon(pts, fill=c + (70,))
        img.alpha_composite(band)
        ld = ImageDraw.Draw(img)
        for k, (_n, t, v, lo, hi) in enumerate(series):
            for r in runs((t <= tend) & np.isfinite(v)):
                pts = list(zip(X(t[r]).tolist(), Y(v[r]).tolist()))
                if len(pts) > 1:
                    ld.line(pts, fill=LINE_COLOURS[k] + (255,), width=2)
        img = img.convert("RGB")
        _chrome(img, var["name"], f"{int(min(tend, t1))}", bool(var.get("synthetic")))
        out.append(np.asarray(img))
    return out


# --------------------------------------------------------------------------- encoding


def _encode(ffmpeg: str, frames: list[np.ndarray], path: Path) -> None:
    common_in = ["-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
                 "-r", str(FPS), "-i", "-", "-an", "-map_metadata", "-1", "-fflags", "+bitexact"]
    if path.suffix == ".webm":
        codec = ["-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "38", "-deadline", "good", "-cpu-used", "2",
                 "-row-mt", "1", "-pix_fmt", "yuv420p"]
    else:
        codec = ["-c:v", "libx264", "-preset", "slow", "-crf", "27", "-pix_fmt", "yuv420p",
                 "-movflags", "+faststart", "-flags", "+bitexact"]
    data = b"".join(np.ascontiguousarray(f, dtype=np.uint8).tobytes() for f in frames)
    proc = subprocess.run([ffmpeg, *common_in, *codec, str(path)], input=data, capture_output=True)
    if proc.returncode != 0:
        raise MediaError(f"ffmpeg failed for {path.name}: {proc.stderr.decode(errors='replace')[-500:]}")


def build_media(root: Path, out: Path, log: Callable[[str], None] = print) -> list[Path]:
    try:
        import imageio_ffmpeg
    except ImportError as exc:  # pragma: no cover - environment
        raise MediaError("imageio-ffmpeg missing: run with `uv run --group media`") from exc
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()

    variables = _load(root / "variables.json")
    regions = {r["id"]: r for r in _load(root / "regions.json")}
    topo = _load(root / "regions.topo.json")
    out.mkdir(parents=True, exist_ok=True)

    jobs = [(v, clip_name(v["describe"]["video"])) for v in variables if v.get("describe", {}).get("video")]
    expected = {f"{n}{ext}" for _, n in jobs for ext in (".webm", ".mp4")}
    for old in list(out.glob("*.webm")) + list(out.glob("*.mp4")):
        if old.name not in expected:
            old.unlink()

    written = []
    for var, name in jobs:
        kind = clip_kind(var)
        if kind == "map":
            frames = _map_frames(root, var, regions, topo)
        elif kind == "outlines":
            frames = _outline_frames(root, var, regions)
        else:
            frames = _line_frames(root, var, regions)
        frames = _loop(frames)
        for ext in (".webm", ".mp4"):
            p = out / f"{name}{ext}"
            _encode(ffmpeg, frames, p)
            written.append(p)
            log(f"media: {p.as_posix()} ({kind}, {len(frames)} frames, {len(frames) / FPS:.1f} s, "
                f"{p.stat().st_size / 1024:.0f} KB)")
    return written
