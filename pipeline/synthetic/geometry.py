"""Coarse geometry for the synthetic build: TopoJSON writing and a crude land mask.

The land mask exists only to switch the ice_mass_map valid mask off over the
ocean. It is hand-drawn and crude (a few dozen vertices per continent).
"""

from __future__ import annotations

from typing import Any

import numpy as np

from .config import ANTARCTICA, GREENLAND, Ring

# Crude continents for the land mask (lon, lat). Even-odd filling, so small
# self-overlaps only punch small holes; good enough for a synthetic mask.
LAND: list[Ring] = [
    # North America
    [(-168, 66), (-162, 70), (-140, 70), (-125, 70), (-95, 72), (-80, 73), (-65, 62), (-55, 52), (-66, 45),
     (-70, 42), (-76, 35), (-81, 31), (-80, 26), (-82, 28), (-90, 30), (-97, 26), (-97, 21), (-87, 21),
     (-83, 15), (-78, 8), (-80, 8), (-86, 12), (-92, 15), (-105, 20), (-112, 29), (-118, 34), (-124, 40),
     (-124, 48), (-132, 55), (-140, 60), (-152, 59), (-165, 55), (-160, 59), (-166, 62)],
    # Canadian Arctic Archipelago
    [(-125, 73), (-95, 73), (-80, 74), (-62, 82), (-90, 82), (-120, 77)],
    # South America
    [(-80, 9), (-72, 12), (-62, 10), (-50, 0), (-35, -5), (-39, -15), (-48, -26), (-58, -38), (-65, -42),
     (-68, -52), (-74, -53), (-75, -45), (-73, -35), (-71, -18), (-76, -14), (-81, -5), (-80, 1), (-77, 8)],
    # Africa
    [(-17, 21), (-10, 30), (-6, 36), (10, 37), (20, 32), (32, 31), (35, 28), (43, 12), (51, 12), (40, -2),
     (40, -15), (35, -24), (28, -34), (18, -35), (13, -20), (12, -5), (9, 4), (-8, 4), (-17, 14)],
    # Eurasia
    [(-9, 37), (-9, 43), (-2, 44), (-4, 48), (2, 51), (8, 54), (8, 57), (5, 59), (5, 62), (14, 68), (25, 71),
     (40, 67), (45, 68), (60, 69), (70, 73), (80, 73), (100, 77), (115, 73), (140, 72), (160, 70), (180, 69),
     (180, 65), (178, 62), (165, 60), (162, 56), (156, 51), (156, 57), (150, 59), (142, 59), (140, 54),
     (135, 43), (129, 35), (126, 37), (121, 40), (122, 31), (120, 23), (110, 21), (108, 16), (105, 9),
     (100, 13), (103, 1), (98, 8), (98, 16), (92, 21), (87, 21), (80, 15), (77, 8), (73, 17), (72, 21),
     (66, 25), (57, 25), (52, 28), (48, 30), (43, 13), (38, 20), (34, 28), (34, 31), (36, 36), (30, 36),
     (26, 38), (26, 40), (23, 40), (22, 37), (19, 40), (14, 45), (12, 44), (16, 41), (18, 40), (15, 38),
     (12, 42), (8, 44), (3, 43), (3, 42), (0, 39), (-2, 37), (-5, 36)],
    # Chukotka east of the antimeridian
    [(-180, 65), (-180, 69), (-172, 67), (-170, 66)],
    # Great Britain
    [(-5, 50), (2, 51), (0, 58), (-6, 58)],
    # Australia
    [(114, -22), (122, -17), (130, -12), (137, -12), (142, -11), (146, -19), (153, -26), (150, -37),
     (141, -38), (135, -35), (115, -35), (114, -26)],
    GREENLAND,
    ANTARCTICA,
]


def points_in_ring(lon: np.ndarray, lat: np.ndarray, ring: Ring) -> np.ndarray:
    """Even-odd ray casting in planar lon/lat."""
    inside = np.zeros(lon.shape, dtype=bool)
    pts = list(ring)
    if pts[0] != pts[-1]:
        pts.append(pts[0])
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        if y0 == y1:
            continue
        cond = (lat >= min(y0, y1)) & (lat < max(y0, y1))
        x_cross = x0 + (lat - y0) * (x1 - x0) / (y1 - y0)
        inside ^= cond & (lon < x_cross)
    return inside


def cell_centres(width: int, height: int) -> tuple[np.ndarray, np.ndarray]:
    """Lon/lat of cell centres on the global grid, row 0 at the north edge."""
    lon = -180 + (np.arange(width) + 0.5) * 360 / width
    lat = 90 - (np.arange(height) + 0.5) * 180 / height
    return np.meshgrid(lon, lat)


def land_mask(width: int, height: int) -> np.ndarray:
    lon, lat = cell_centres(width, height)
    mask = np.zeros(lon.shape, dtype=bool)
    for ring in LAND:
        mask |= points_in_ring(lon, lat, ring)
    return mask


# --------------------------------------------------------------------------- TopoJSON
class TopoWriter:
    """Unquantized TopoJSON: one arc per ring, coordinates in degrees."""

    def __init__(self) -> None:
        self.arcs: list[list[list[float]]] = []

    def ring(self, ring: Ring) -> list[int]:
        pts = [[round(float(x), 4), round(float(y), 4)] for x, y in ring]
        if pts[0] != pts[-1]:
            pts.append(list(pts[0]))
        self.arcs.append(pts)
        return [len(self.arcs) - 1]

    def geometry(self, outline: Ring | list[Ring], **extra: Any) -> dict[str, Any]:
        if outline and isinstance(outline[0][0], (list, tuple)):  # list of rings -> MultiPolygon
            geom = {"type": "MultiPolygon", "arcs": [[self.ring(r)] for r in outline]}  # type: ignore[arg-type]
        else:
            geom = {"type": "Polygon", "arcs": [self.ring(outline)]}  # type: ignore[arg-type]
        geom.update(extra)
        return geom

    def topology(self, object_name: str, geometries: list[dict[str, Any]]) -> dict[str, Any]:
        return {
            "type": "Topology",
            "objects": {object_name: {"type": "GeometryCollection", "geometries": geometries}},
            "arcs": self.arcs,
        }


def scale_ring(ring: Ring, factor: float) -> Ring:
    """Shrink or grow a ring about its vertex centroid in planar lon/lat (crude, fine for coarse outlines)."""
    xs = np.array([p[0] for p in ring], dtype=float)
    ys = np.array([p[1] for p in ring], dtype=float)
    cx, cy = xs.mean(), ys.mean()
    return [(cx + (x - cx) * factor, cy + (y - cy) * factor) for x, y in zip(xs, ys)]
