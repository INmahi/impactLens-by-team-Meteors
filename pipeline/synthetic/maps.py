"""Synthetic gridded map layers packed into 8-bit RGBA atlases.

Grid: global 1-degree, 360 x 180, bbox [-180, -90, 180, 90], row 0 at the
north edge, column 0 at -180. Packing (contract): q = round((v - offset) / scale)
clamped to 0..65535; R = q >> 8, G = q & 255, B = 255 valid / 0 missing, A = 255.
Missing cells are written as R = G = 0 so the PNGs compress well.

The map layers are NOT region means of the series files and the series are not
derived from them; the synthetic map and series are independent.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image

from .config import ATLAS_MAX, GRID_HEIGHT, GRID_WIDTH, LayerSpec
from .geometry import cell_centres, land_mask
from .series import decimal_years, monthly_dates, stream

PACKING = "R=high byte, G=low byte, B=valid mask, A=255"


# --------------------------------------------------------------------------- smooth fields
# Every spatial pattern is a function of the 3D unit vector of the cell centre, not
# of raw lon/lat, so the fields are continuous at both poles (nearly constant around
# the +-89.5 rows) and across the 180 meridian.
def unit_vectors(lon: np.ndarray, lat: np.ndarray) -> np.ndarray:
    """(..., 3) unit vectors x = cos lat cos lon, y = cos lat sin lon, z = sin lat (degrees in)."""
    lo, la = np.radians(lon), np.radians(lat)
    return np.stack([np.cos(la) * np.cos(lo), np.cos(la) * np.sin(lo), np.sin(la)], axis=-1)


def great_circle_deg(p: np.ndarray, q: np.ndarray) -> np.ndarray:
    """Angle in degrees between unit vectors p (..., 3) and q (3,)."""
    return np.degrees(np.arccos(np.clip(p @ q, -1.0, 1.0)))


def fibonacci_sphere(n: int) -> np.ndarray:
    """n nearly uniform unit vectors (Fibonacci lattice), shape (n, 3)."""
    i = np.arange(n) + 0.5
    z = 1.0 - 2.0 * i / n
    r = np.sqrt(1.0 - z * z)
    th = np.pi * (3.0 - np.sqrt(5.0)) * i
    return np.stack([r * np.cos(th), r * np.sin(th), z], axis=1)


class SmoothNoise:
    """Spatially smooth, isotropic random fields on the sphere, AR(1) in time.

    Standard-normal weights on about 4*pi/step^2 nearly uniform nodes (Fibonacci
    lattice), spread to the grid by a Gaussian kernel of the chord distance with
    width step_deg. The kernel is shifted down by its value at 4 widths and clipped
    at 0, so it reaches 0 continuously; each cell is then scaled to unit variance.
    """

    CUT = 4.0  # kernel support in kernel widths

    def __init__(self, rng: np.random.Generator, step_deg: float, phi: float) -> None:
        self.rng, self.phi = rng, phi
        step = np.radians(step_deg)
        nodes = fibonacci_sphere(int(round(4 * np.pi / step ** 2)))
        lon, lat = cell_centres(GRID_WIDTH, GRID_HEIGHT)
        cells = unit_vectors(lon, lat).reshape(-1, 3)
        cut = np.exp(-0.5 * self.CUT ** 2)
        cap = 2 * np.sin(self.CUT * step / 2)  # chord at CUT kernel widths
        k = int(len(nodes) * np.sin(self.CUT * step / 2) ** 2 * 1.5) + 8  # >= nodes inside the cap
        idx = np.empty((len(cells), k), dtype=np.int64)
        w = np.empty((len(cells), k))
        for a in range(0, len(cells), 4096):
            d2 = 2.0 - 2.0 * (cells[a:a + 4096] @ nodes.T)        # squared chord distance
            near = np.argsort(d2, axis=1, kind="stable")[:, :k]
            if not (np.take_along_axis(d2, near[:, -1:], axis=1) > cap ** 2).all():
                raise ValueError("SmoothNoise: too few neighbours kept; raise k")
            idx[a:a + 4096] = near
            w[a:a + 4096] = np.clip(np.exp(-0.5 * np.take_along_axis(d2, near, axis=1) / step ** 2) - cut, 0, None)
        w /= np.sqrt((w ** 2).sum(axis=1, keepdims=True))
        self.idx, self.w = idx, w
        self.n = len(nodes)
        self.state = self._draw()

    def _draw(self) -> np.ndarray:
        return self.rng.standard_normal(self.n)

    def step(self) -> np.ndarray:
        self.state = self.phi * self.state + np.sqrt(1 - self.phi ** 2) * self._draw()
        return (self.w * self.state[self.idx]).sum(axis=1).reshape(GRID_HEIGHT, GRID_WIDTH)


def _bump(cells: np.ndarray, lon0: float, lat0: float, sigma: float) -> np.ndarray:
    """Gaussian of the great-circle distance (degrees) from (lon0, lat0)."""
    d = great_circle_deg(cells, unit_vectors(np.float64(lon0), np.float64(lat0)))
    return np.exp(-d ** 2 / (2 * sigma ** 2))


def smooth_on_sphere(field: np.ndarray, sigma_deg: float) -> np.ndarray:
    """Gaussian blur of a (H, W) grid that stays continuous at the poles and the 180 meridian.

    Latitude blur first (rows), then a periodic longitude blur whose width in
    degrees of longitude is sigma / cos(lat), so the polar rows end up nearly
    constant around the circle.
    """
    lat = 90 - (np.arange(GRID_HEIGHT) + 0.5) * 180 / GRID_HEIGHT
    off = np.arange(-int(4 * sigma_deg), int(4 * sigma_deg) + 1)
    kern = np.exp(-0.5 * (off / sigma_deg) ** 2)
    rows = np.clip(np.arange(GRID_HEIGHT)[:, None] + off[None, :], 0, GRID_HEIGHT - 1)
    out = (field[rows] * kern[None, :, None]).sum(axis=1) / kern.sum()
    freq = np.fft.rfftfreq(GRID_WIDTH, d=360 / GRID_WIDTH)                  # cycles per degree
    sig_lon = sigma_deg / np.maximum(np.cos(np.radians(lat)), 1e-3)
    gain = np.exp(-2 * (np.pi * freq[None, :] * sig_lon[:, None]) ** 2)
    return np.fft.irfft(np.fft.rfft(out, axis=1) * gain, n=GRID_WIDTH, axis=1)


# --------------------------------------------------------------------------- layer models
@dataclass
class LayerFields:
    dates: list[str]          # every month in the span, including missing ones
    values: np.ndarray        # (n_frames_with_data, H, W) float32, NaN where invalid
    frame_dates: list[str]
    value_range: tuple[float, float]


# GRACE-like mass change hot spots: (lon, lat, cm w.e. per year, sigma in degrees).
ICE_MASS_TRENDS = [
    (-40, 64, -18, 3), (-60, 77, -10, 3), (-50, 69, -8, 2.5), (-40, 73, -2, 6),        # Greenland margins
    (-110, -75, -25, 4), (-63, -66, -8, 2.5), (120, -69, -3, 6), (30, -72, 4, 8),      # Antarctica
    (-142, 61, -12, 3), (-73, -49, -10, 2.5), (-80, 78, -6, 4), (85, 32, -2, 4),       # glaciers
    (77, 29, -3, 3), (50, 45, -2, 3),                                                  # groundwater, Caspian
]
# Seasonal hydrology / surface mass balance: (lon, lat, amplitude cm, sigma deg, phase rad).
ICE_MASS_SEASONAL = [
    (-60, -5, 25, 8, 0.5), (85, 25, 20, 5, 3.5), (100, 62, 8, 10, 2.0), (20, -8, 12, 7, 1.0),
    (-45, 70, 10, 4, 4.0),
]


def ice_mass_map_fields(layer: LayerSpec, seed: int) -> LayerFields:
    rng = stream(seed, "map", layer.id)
    lon, lat = cell_centres(GRID_WIDTH, GRID_HEIGHT)
    cells = unit_vectors(lon, lat)
    valid = land_mask(GRID_WIDTH, GRID_HEIGHT)
    trend = np.zeros(lon.shape)
    for lo, la, rate, sig in ICE_MASS_TRENDS:
        trend += rate * _bump(cells, lo, la, sig)
    amp = np.zeros(lon.shape)
    phase = np.zeros(lon.shape)
    weight = np.zeros(lon.shape)
    for lo, la, a, sig, ph in ICE_MASS_SEASONAL:
        b = _bump(cells, lo, la, sig)
        amp += a * b
        phase += ph * b
        weight += b
    phase = np.where(weight > 1e-6, phase / np.maximum(weight, 1e-6), 0.0)
    noise = SmoothNoise(rng, 15.0, 0.5)
    dates = monthly_dates(layer.start, layer.end)
    missing = set(layer.missing)
    t_all = decimal_years(dates)
    frames, frame_dates = [], []
    for d, t in zip(dates, t_all):
        field = noise.step() * 2.0  # always step, so missing months keep the AR(1) clock running
        if d in missing:
            continue
        # Anomaly relative to mid-2007 (the GRACE 2004-2009 baseline centre).
        v = trend * (t - 2007.0) + amp * np.sin(2 * np.pi * t + phase) + field
        frames.append(np.where(valid, v, np.nan).astype(np.float32))
        frame_dates.append(d)
    return LayerFields(dates, np.stack(frames), frame_dates, (-300.0, 300.0))


def temperature_fields(layer: LayerSpec, seed: int) -> LayerFields:
    rng = stream(seed, "map", layer.id)
    lon, lat = cell_centres(GRID_WIDTH, GRID_HEIGHT)
    # Land fraction blurred on the sphere: anomaly fields have no sharp coastline
    # steps, and the crude mask's coast along the 180 meridian (64.5N) leaves no seam.
    land = smooth_on_sphere(land_mask(GRID_WIDTH, GRID_HEIGHT).astype(float), 3.0)
    s = np.sin(np.radians(lat))
    # Warming trend in degC per year: about 0.02 in the tropics, Arctic amplification
    # to about 0.07 near Greenland, weaker over the Southern Ocean and Antarctica.
    trend = 0.018 + 0.05 * np.clip(s, 0, None) ** 2 - 0.006 * np.clip(-s, 0, None) + 0.008 * land
    sd = 0.4 + 1.8 * s ** 2 + 0.3 * land
    noise = SmoothNoise(rng, 10.0, 0.4)
    dates = monthly_dates(layer.start, layer.end)
    t_all = decimal_years(dates)
    frames = []
    for t in t_all:
        # Anomaly relative to 1991-2020 (centre 2006.0); no seasonal cycle in anomalies.
        v = trend * (t - 2006.0) + sd * noise.step()
        frames.append(v.astype(np.float32))
    return LayerFields(dates, np.stack(frames), list(dates), (-6.0, 6.0))


LAYER_MODELS = {"ice_mass_map": ice_mass_map_fields, "temperature": temperature_fields}


# --------------------------------------------------------------------------- packing
def pack(values: np.ndarray, scale: float, offset: float) -> tuple[np.ndarray, int]:
    """(H, W) float with NaN = missing -> (H, W, 4) uint8 RGBA. Returns (rgba, n_clamped)."""
    valid = np.isfinite(values)
    q = np.rint((np.where(valid, values, offset) - offset) / scale)
    clamped = int(np.count_nonzero(valid & ((q < 0) | (q > 65535))))
    q = np.clip(q, 0, 65535).astype(np.uint32)
    q[~valid] = 0
    rgba = np.empty(values.shape + (4,), dtype=np.uint8)
    rgba[..., 0] = (q >> 8).astype(np.uint8)
    rgba[..., 1] = (q & 255).astype(np.uint8)
    rgba[..., 2] = np.where(valid, 255, 0).astype(np.uint8)
    rgba[..., 3] = 255
    return rgba, clamped


def unpack(rgba: np.ndarray, scale: float, offset: float) -> np.ndarray:
    q = rgba[..., 0].astype(np.int64) * 256 + rgba[..., 1]
    return np.where(rgba[..., 2] == 255, q * scale + offset, np.nan)


def save_png(arr: np.ndarray, path: Path) -> None:
    """8-bit RGBA, no colour chunks (Pillow writes none by default)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(arr, "RGBA").save(path, format="PNG", compress_level=9)


def write_layer(layer: LayerSpec, fields: LayerFields, layer_dir: Path) -> tuple[dict[str, Any], int]:
    w, h = GRID_WIDTH, GRID_HEIGHT
    cols, rows = ATLAS_MAX // w, ATLAS_MAX // h
    per_atlas = cols * rows
    n = len(fields.frame_dates)
    atlases, frames = [], []
    clamped_total = 0
    for a, first in enumerate(range(0, n, per_atlas)):
        count = min(per_atlas, n - first)
        aw = min(count, cols) * w
        ah = -(-count // cols) * h
        img = np.zeros((ah, aw, 4), dtype=np.uint8)
        img[..., 3] = 255
        for k in range(count):
            i = first + k
            x, y = (k % cols) * w, (k // cols) * h
            rgba, clamped = pack(fields.values[i], layer.scale, layer.offset)
            clamped_total += clamped
            img[y:y + h, x:x + w] = rgba
            frames.append({"date": fields.frame_dates[i], "atlas": a, "x": x, "y": y, "w": w, "h": h})
        rel = f"frames/atlas-{a:03d}.png"
        save_png(img, layer_dir / rel)
        atlases.append({"file": rel, "width": aw, "height": ah})
    manifest: dict[str, Any] = {"variable": layer.id}
    if layer.name:
        manifest["name"] = layer.name
    manifest.update({
        "units": layer.units,
        "grid": {"bbox": [-180, -90, 180, 90], "width": w, "height": h},
        "encoding": {"scale": layer.scale, "offset": layer.offset, "packing": PACKING},
        "valueRange": list(fields.value_range),
        **({"fadeNearZero": True} if layer.fade_near_zero else {}),
        **({"glow": True} if layer.glow else {}),
        "atlases": atlases,
        "frames": frames,
        "missing": sorted(layer.missing),
        "source": layer.source,
        "synthetic": True,
    })
    return manifest, clamped_total


def melt_colormap() -> np.ndarray:
    """256x1 "melt" ramp for mass-change maps; left = valueRange[0] (most loss), centre = 0, right = most gain.
    Loss glows yellow -> orange -> red -> deep red with size; gain is a cool blue (M12, item 7)."""
    xs = [0.0, 0.12, 0.27, 0.40, 0.47, 0.5, 0.53, 0.70, 1.0]
    stops = np.array([
        [120, 0, 25], [200, 20, 30], [245, 90, 20], [255, 170, 30], [255, 215, 80],
        [255, 230, 140], [190, 225, 255], [110, 175, 240], [35, 85, 190],
    ], dtype=float)
    x = np.linspace(0, 1, 256)
    rgb = np.stack([np.interp(x, xs, stops[:, c]) for c in range(3)], axis=1)
    out = np.empty((1, 256, 4), dtype=np.uint8)
    out[0, :, :3] = np.rint(rgb).astype(np.uint8)
    out[0, :, 3] = 255
    return out


def colormap(reverse: bool) -> np.ndarray:
    """256x1 diverging blue-white-red ramp; left = valueRange[0].

    Placeholder only: the real perceptual maps (Crameri vik / cmocean balance)
    come in M10.
    """
    stops = np.array([[33, 102, 172], [247, 247, 247], [178, 24, 43]], dtype=float)
    if reverse:
        stops = stops[::-1]
    x = np.linspace(0, 1, 256)
    rgb = np.stack([np.interp(x, [0, 0.5, 1], stops[:, c]) for c in range(3)], axis=1)
    out = np.empty((1, 256, 4), dtype=np.uint8)
    out[0, :, :3] = np.rint(rgb).astype(np.uint8)
    out[0, :, 3] = 255
    return out
