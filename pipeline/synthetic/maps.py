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
def _interp_matrix(targets: np.ndarray, nodes: np.ndarray) -> np.ndarray:
    """Linear interpolation weights, shape (len(targets), len(nodes)); nodes ascending."""
    m = np.zeros((len(targets), len(nodes)))
    idx = np.clip(np.searchsorted(nodes, targets) - 1, 0, len(nodes) - 2)
    w = (targets - nodes[idx]) / (nodes[idx + 1] - nodes[idx])
    m[np.arange(len(targets)), idx] = 1 - w
    m[np.arange(len(targets)), idx + 1] = w
    return m


class SmoothNoise:
    """Spatially smooth random fields: random values on a coarse node grid, bilinear
    interpolation to the 1-degree grid (periodic in longitude), AR(1) in time."""

    def __init__(self, rng: np.random.Generator, step_deg: float, phi: float) -> None:
        self.rng, self.phi = rng, phi
        lon_nodes = np.arange(-180, 180 + step_deg / 2, step_deg)
        lat_nodes = np.arange(-90, 90 + step_deg / 2, step_deg)
        lon = -180 + (np.arange(GRID_WIDTH) + 0.5)
        lat = 90 - (np.arange(GRID_HEIGHT) + 0.5)
        self.ly = _interp_matrix(lat, lat_nodes)            # (H, nlat)
        self.lx = _interp_matrix(lon, lon_nodes)            # (W, nlon)
        self.nlat, self.nlon = len(lat_nodes), len(lon_nodes) - 1  # last lon node repeats the first
        self.state = self._draw()

    def _draw(self) -> np.ndarray:
        return self.rng.standard_normal((self.nlat, self.nlon))

    def step(self) -> np.ndarray:
        self.state = self.phi * self.state + np.sqrt(1 - self.phi ** 2) * self._draw()
        nodes = np.concatenate([self.state, self.state[:, :1]], axis=1)
        return self.ly @ nodes @ self.lx.T


def _bump(lon: np.ndarray, lat: np.ndarray, lon0: float, lat0: float, sigma: float) -> np.ndarray:
    dlon = (lon - lon0 + 180) % 360 - 180
    d2 = (lat - lat0) ** 2 + (dlon * np.cos(np.radians(lat0))) ** 2
    return np.exp(-d2 / (2 * sigma ** 2))


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
    valid = land_mask(GRID_WIDTH, GRID_HEIGHT)
    trend = np.zeros(lon.shape)
    for lo, la, rate, sig in ICE_MASS_TRENDS:
        trend += rate * _bump(lon, lat, lo, la, sig)
    amp = np.zeros(lon.shape)
    phase = np.zeros(lon.shape)
    weight = np.zeros(lon.shape)
    for lo, la, a, sig, ph in ICE_MASS_SEASONAL:
        b = _bump(lon, lat, lo, la, sig)
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
    land = land_mask(GRID_WIDTH, GRID_HEIGHT)
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
    manifest = {
        "variable": layer.id,
        "units": layer.units,
        "grid": {"bbox": [-180, -90, 180, 90], "width": w, "height": h},
        "encoding": {"scale": layer.scale, "offset": layer.offset, "packing": PACKING},
        "valueRange": list(fields.value_range),
        "atlases": atlases,
        "frames": frames,
        "missing": sorted(layer.missing),
        "source": layer.source,
        "synthetic": True,
    }
    return manifest, clamped_total


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
