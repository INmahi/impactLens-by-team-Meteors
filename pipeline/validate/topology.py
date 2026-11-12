"""TopoJSON geometry checks (rule 9): arc indices, closed rings, lon/lat range.

Input has already passed topology.schema.json, which checks only the outer shape.
"""

from __future__ import annotations

import math
from typing import Any

Point = tuple[float, float]
EPS = 1e-9


def _is_num(x: Any) -> bool:
    return isinstance(x, (int, float)) and not isinstance(x, bool) and math.isfinite(x)


def decode_arcs(topo: dict[str, Any]) -> tuple[list[list[Point]], list[str]]:
    """Decode (and de-quantize) the arcs. Returns (arcs, problems)."""
    problems: list[str] = []
    transform = topo.get("transform")
    sx = sy = 1.0
    tx = ty = 0.0
    quantized = False
    if transform is not None:
        scale, translate = transform.get("scale"), transform.get("translate")
        if (
            isinstance(scale, list) and len(scale) == 2 and all(_is_num(v) for v in scale)
            and isinstance(translate, list) and len(translate) == 2 and all(_is_num(v) for v in translate)
        ):
            (sx, sy), (tx, ty) = scale, translate
            quantized = True
        else:
            problems.append("transform needs scale [sx, sy] and translate [tx, ty]")
    arcs: list[list[Point]] = []
    for i, arc in enumerate(topo.get("arcs", [])):
        pts: list[Point] = []
        ok = isinstance(arc, list) and len(arc) >= 2
        if ok:
            x = y = 0.0
            for p in arc:
                if not (isinstance(p, list) and len(p) >= 2 and _is_num(p[0]) and _is_num(p[1])):
                    ok = False
                    break
                if quantized:
                    x += p[0]
                    y += p[1]
                    pts.append((x * sx + tx, y * sy + ty))
                else:
                    pts.append((float(p[0]), float(p[1])))
        if not ok:
            problems.append(f"arc {i} must be a list of at least 2 [x, y] positions")
            pts = []
        arcs.append(pts)
    return arcs, problems


def _line(arcs: list[list[Point]], refs: Any, where: str, problems: list[str]) -> list[Point] | None:
    if not isinstance(refs, list) or not refs:
        problems.append(f"{where}: needs a non-empty list of arc indices")
        return None
    out: list[Point] = []
    for ref in refs:
        if not isinstance(ref, int) or isinstance(ref, bool):
            problems.append(f"{where}: arc index {ref!r} is not an integer")
            return None
        idx = ref if ref >= 0 else ~ref
        if idx >= len(arcs):
            problems.append(f"{where}: arc index {ref} is out of range ({len(arcs)} arcs)")
            return None
        pts = arcs[idx] if ref >= 0 else arcs[idx][::-1]
        if not pts:
            return None  # already reported as a bad arc
        if out:
            if not _same(out[-1], pts[0]):
                problems.append(f"{where}: arc {ref} does not start where the previous arc ends")
                return None
            out.extend(pts[1:])
        else:
            out.extend(pts)
    return out


def _same(a: Point, b: Point) -> bool:
    return abs(a[0] - b[0]) <= EPS and abs(a[1] - b[1]) <= EPS


def _ring(arcs: list[list[Point]], refs: Any, where: str, problems: list[str]) -> list[Point] | None:
    pts = _line(arcs, refs, where, problems)
    if pts is None:
        return None
    if len(pts) < 4 or not _same(pts[0], pts[-1]):
        problems.append(f"{where}: ring is not closed (needs at least 4 positions, first == last)")
        return None
    return pts


def check_geometry(geom: dict[str, Any], arcs: list[list[Point]], label: str) -> list[str]:
    """Problems for one geometry: arc references, ring closure and coordinate range."""
    problems: list[str] = []
    gtype, refs = geom.get("type"), geom.get("arcs")
    lines: list[list[Point] | None] = []
    if gtype == "LineString":
        lines.append(_line(arcs, refs, label, problems))
    elif gtype == "MultiLineString":
        if not isinstance(refs, list) or not refs:
            problems.append(f"{label}: MultiLineString needs a list of lines")
        else:
            lines += [_line(arcs, r, f"{label} line {i}", problems) for i, r in enumerate(refs)]
    elif gtype == "Polygon":
        if not isinstance(refs, list) or not refs:
            problems.append(f"{label}: Polygon needs a list of rings")
        else:
            lines += [_ring(arcs, r, f"{label} ring {i}", problems) for i, r in enumerate(refs)]
    elif gtype == "MultiPolygon":
        if not isinstance(refs, list) or not refs:
            problems.append(f"{label}: MultiPolygon needs a list of polygons")
        else:
            for j, poly in enumerate(refs):
                if not isinstance(poly, list) or not poly:
                    problems.append(f"{label} polygon {j}: needs a list of rings")
                    continue
                lines += [_ring(arcs, r, f"{label} polygon {j} ring {i}", problems) for i, r in enumerate(poly)]
    for pts in lines:
        if pts is None:
            continue
        bad = [p for p in pts if not (-180 - EPS <= p[0] <= 180 + EPS and -90 - EPS <= p[1] <= 90 + EPS)]
        if bad:
            problems.append(f"{label}: position {bad[0]} is outside lon -180..180, lat -90..90")
            break
    return problems
