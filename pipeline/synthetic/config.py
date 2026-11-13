"""Synthetic build configuration: regions, variables, series and map layers.

Regions are data, not code (CLAUDE.md). Adding a region, for example a glacier
region such as `alaska`, needs only:
  1. an entry in REGIONS (id, name, parent, kind, bbox, camera, outline), and
  2. a SeriesSpec under that region id in every valid variable's `series`.
regions.json, regions.topo.json, each variable's `regions`/`periods`, the
series and stats files are all derived from these lists by build.py.

Every series is: injected linear trend + AR(1) noise (+ a seasonal cycle on
monthly series), with the parameters written to the series' `injected` field.
`noise_sd` is the marginal (stationary) standard deviation of the AR(1) noise
and `ar1` its lag-1 autocorrelation at the series' own time step.

Magnitudes follow the published literature loosely (IMBIE 2026, MERRA-2,
NASA-SSH, Frederikse et al. 2020) so the charts look plausible. They are not
measurements.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any

from .bangladesh import BANGLADESH, BD_DISTRICTS, BD_DIVISIONS

DEFAULT_SEED = 20261112

Ring = list[tuple[float, float]]  # closed or open lon/lat ring; the writer closes it

# --------------------------------------------------------------------------- regions
# Outlines are coarse hand-made rings (lon, lat in degrees), tens of vertices.
# Rings are written counter-clockwise in planar lon/lat (RFC 7946 order).
# A polar cap is drawn Natural Earth style: along the coast, then along the
# -180/180 meridians down to the pole.

# Greenland, listed clockwise from the north coast; reversed below.
_GREENLAND_CW: Ring = [
    (-60, 82.0), (-45, 82.6), (-30, 83.4), (-20, 82.0), (-12, 81.5), (-18, 79.5), (-19, 77.0),
    (-18, 75.0), (-22, 72.5), (-22, 70.5), (-26, 68.5), (-32, 68.0), (-37, 65.7), (-40, 65.0),
    (-42, 62.5), (-43, 60.0), (-45, 60.5), (-48, 61.0), (-50, 63.0), (-51, 64.5), (-53, 66.0),
    (-54, 68.0), (-51, 69.5), (-54, 71.0), (-56, 72.5), (-58, 75.0), (-63, 76.2), (-68, 76.5),
    (-72, 77.5), (-73, 78.5), (-68, 80.0), (-62, 81.3),
]
GREENLAND: Ring = _GREENLAND_CW[::-1]

# Antarctic coast (including the big ice shelves), west to east from -180 to 180.
_ANT_COAST_W_TO_E: Ring = [
    (-180, -78.0), (-165, -78.3), (-150, -77.0), (-135, -75.0), (-120, -73.8), (-105, -73.5),
    (-90, -72.8), (-80, -73.0), (-75, -71.0), (-70, -68.5), (-66, -66.5), (-63, -64.5),
    (-58, -63.2), (-56, -64.0), (-60, -67.5), (-62, -71.0), (-60, -74.5), (-50, -77.5),
    (-40, -78.0), (-30, -76.0), (-20, -73.5), (-10, -71.0), (0, -70.0), (15, -70.0), (30, -69.5),
    (45, -67.5), (60, -67.0), (75, -69.5), (90, -66.5), (105, -66.0), (120, -66.5), (135, -66.5),
    (150, -68.5), (165, -71.5), (170, -76.0), (180, -78.0),
]
ANTARCTICA: Ring = [(-180, -90), (180, -90)] + _ANT_COAST_W_TO_E[::-1]

# Sub-regions: rough sectors meeting at the pole (not a tiling of the outline above).
ANTARCTICA_WEST: Ring = [
    (-150, -90), (-45, -90), (-45, -78.0), (-60, -75.0), (-75, -73.5), (-90, -72.8),
    (-105, -73.5), (-120, -73.8), (-135, -75.0), (-150, -77.0),
]
ANTARCTICA_PENINSULA: Ring = [
    (-75, -74.0), (-60, -74.5), (-62, -71.0), (-60, -67.5), (-56, -64.0), (-58, -63.2),
    (-63, -64.5), (-66, -66.5), (-70, -68.5), (-75, -71.0),
]
# East Antarctica crosses the antimeridian, so it is a MultiPolygon split at 180.
ANTARCTICA_EAST: list[Ring] = [
    [(-45, -90), (180, -90), (180, -78.0), (170, -76.0), (165, -71.5), (150, -68.5), (135, -66.5),
     (120, -66.5), (105, -66.0), (90, -66.5), (75, -69.5), (60, -67.0), (45, -67.5), (30, -69.5),
     (15, -70.0), (0, -70.0), (-10, -71.0), (-20, -73.5), (-30, -76.0), (-40, -78.0), (-45, -78.0)],
    [(-180, -90), (-150, -90), (-150, -77.0), (-165, -78.3), (-180, -78.0)],
]


# Coastal seas (kind "coastal_sea"): the polygon IS the averaging polygon of the real
# build (docs/datasets/sea-level-gridded-ssh.md: 0.5-degree NASA-SSH grid, cell centre
# in polygon, cos-lat area weights). Altimetry degrades near land and the grid is
# smoothed over about 100 km, so every polygon is drawn over open sea about 100 km
# (roughly 1 degree of latitude) from the coast and from large islands. It covers the
# sea the series averages, never the land or the shore.
# Hand-drawn from coastline knowledge, not from a coastline dataset: the real build
# must confirm the 100 km clearance with the grid's valid-cell mask.
# Listed counter-clockwise (sea on the left).

# Northern Bay of Bengal: deep Bay off the Indian east coast, the Ganges-Brahmaputra
# delta and Myanmar; south edge along 13N, clear of the Andaman and Coco Islands.
BAY_OF_BENGAL: Ring = [
    (81.2, 13.0), (86.0, 13.0), (91.8, 13.0), (92.2, 15.0), (93.0, 16.0), (93.3, 17.0), (93.0, 18.0),
    (92.4, 19.0), (91.6, 20.0), (91.0, 20.8), (90.0, 21.0), (89.0, 20.9), (88.0, 20.3), (86.9, 19.2),
    (85.2, 18.1), (84.0, 17.0), (83.0, 15.9), (81.9, 15.1), (81.2, 14.6), (81.2, 13.5),
]

# Gulf of Mexico, closed north of the Yucatan Channel and the Florida Straits.
GULF_OF_MEXICO: Ring = [
    (-86.6, 22.8), (-85.0, 23.2), (-84.0, 24.4), (-83.7, 25.5), (-83.3, 26.5), (-83.8, 27.5),
    (-84.0, 28.5), (-84.4, 28.7), (-85.6, 28.8), (-86.6, 29.4), (-87.8, 29.3), (-88.3, 28.2),
    (-89.4, 27.9), (-90.5, 28.0), (-91.5, 28.4), (-92.5, 28.6), (-93.8, 28.7), (-94.6, 28.3),
    (-95.5, 27.6), (-96.2, 27.0), (-96.2, 26.0), (-96.5, 24.5), (-96.8, 22.3), (-96.2, 21.0),
    (-95.4, 19.9), (-94.6, 19.4), (-94.0, 19.1), (-92.5, 19.6), (-91.6, 20.0), (-91.4, 21.3),
    (-90.0, 22.4), (-88.0, 22.6),
]

# US Atlantic coast: a band about 100-300 km offshore from Cape Canaveral to the Gulf
# of Maine (upper slope and Gulf Stream edge; the shelf itself is mostly within 100 km
# of land in the south). Starts north of the Bahamas. Not the open Atlantic.
US_EAST_COAST: Ring = [
    # outer edge, south to north
    (-78.5, 28.5), (-78.2, 30.0), (-77.3, 31.3), (-75.6, 32.3), (-73.6, 33.5), (-72.6, 35.0),
    (-72.6, 36.5), (-72.2, 37.6), (-71.0, 38.3), (-69.0, 38.9), (-67.0, 39.6), (-65.8, 41.0),
    (-66.0, 42.4),
    # inner edge (about 100 km offshore), north to south
    (-67.4, 43.2), (-68.4, 43.0), (-68.7, 42.4), (-68.7, 40.7), (-70.6, 40.0), (-72.0, 39.9),
    (-72.9, 39.6), (-73.8, 38.6), (-74.4, 37.7), (-74.5, 36.5), (-74.4, 35.0), (-75.8, 33.8),
    (-77.6, 33.0), (-78.8, 32.4), (-79.8, 31.5), (-80.0, 30.0), (-79.5, 28.5),
]

# Western tropical Pacific warm pool: open sea east of the Philippines and north of
# New Guinea and the Bismarck Archipelago; open edges along 15N, 160E and 4S.
# Small islands inside (Palau, Guam, the Carolines) are masked per cell in the real build.
WESTERN_TROPICAL_PACIFIC: Ring = [
    (160.0, 15.0), (140.0, 15.0), (124.6, 15.0), (125.6, 14.0), (126.5, 12.6), (126.8, 11.2),
    (127.3, 9.8), (127.5, 8.5), (127.8, 7.0), (128.0, 5.0), (130.0, 2.5), (131.5, 0.9),
    (134.0, 0.6), (137.0, -0.3), (139.0, -1.0), (141.5, -1.4), (145.0, -2.5), (145.6, -1.4), (147.0, -0.9),
    (149.6, -0.4), (151.0, -1.6), (153.5, -2.3), (155.0, -4.0), (160.0, -4.0), (160.0, 5.0),
]

# North Sea: the open central and northern North Sea. The 100 km clearance leaves out
# the Southern Bight, the Wadden Sea coast, the Skagerrak and the Norwegian Trench edge.
NORTH_SEA: Ring = [
    (3.0, 53.6), (5.4, 54.5), (6.8, 54.8), (6.6, 55.3), (6.5, 56.5), (5.8, 57.2), (4.2, 58.0),
    (3.4, 59.3), (3.0, 60.3), (2.9, 61.0), (1.0, 61.0), (0.9, 60.3), (0.6, 59.4), (0.0, 58.6),
    (-0.2, 57.6), (-0.6, 56.6), (-0.2, 55.6), (1.0, 54.8), (1.6, 53.9),
]

# Mediterranean Sea: three open-sea parts (a MultiPolygon). The Adriatic, Aegean and
# Alboran Sea are narrower than the 100 km clearance on both sides, and the parts keep
# clear of the Balearics, Corsica, Sardinia, Sicily, Malta, Crete, Rhodes and Cyprus.
MEDITERRANEAN: list[Ring] = [
    # Algero-Provencal basin, east of the Balearics
    [(5.5, 37.9), (7.2, 38.2), (7.2, 40.0), (7.2, 41.4), (7.3, 42.4), (5.5, 42.1), (4.8, 41.9),
     (3.9, 41.0), (5.0, 41.0), (5.5, 40.3), (5.5, 39.0)],
    # Tyrrhenian Sea
    [(11.0, 39.0), (13.5, 39.1), (14.6, 39.3), (13.3, 39.8), (12.0, 40.4), (11.2, 41.3), (11.0, 40.0)],
    # Central Mediterranean, Ionian Sea and Levantine basin (south of Crete and Cyprus)
    [(13.0, 34.3), (14.0, 33.8), (16.0, 33.0), (18.5, 31.8), (19.3, 33.0), (21.8, 33.9), (23.0, 33.8),
     (24.5, 33.1), (25.8, 32.8), (27.0, 32.4), (28.5, 32.2), (30.3, 32.4), (31.8, 32.5), (33.4, 32.2),
     (33.8, 32.6), (34.2, 33.8), (32.5, 33.6), (31.2, 34.3), (31.0, 35.3), (29.0, 35.2), (28.0, 34.8),
     (26.6, 34.0), (25.0, 34.0), (24.0, 34.1), (22.9, 34.3), (22.4, 35.4), (20.6, 36.4), (19.5, 37.3),
     (19.2, 38.2), (19.0, 39.0), (18.2, 38.6), (17.2, 37.5), (16.4, 37.2), (16.2, 36.8), (15.8, 35.5),
     (14.9, 35.0)],
]


@dataclass(frozen=True)
class RegionSpec:
    id: str
    name: str
    parent: str | None
    kind: str  # ice_sheet | ice_sheet_basin | glacier_region | coastal_sea | country | division | district | global
    bbox: tuple[float, float, float, float]
    camera: dict[str, float]
    # None for kind "global"; one ring for a Polygon; a list of rings for a MultiPolygon.
    outline: Ring | list[Ring] | None
    # Caveats shown only when this region is selected (regions.json `notes`, optional).
    notes: tuple[str, ...] = ()


def _cam(lon: float, lat: float, height: float) -> dict[str, float]:
    return {"lon": lon, "lat": lat, "height": height, "heading": 0, "pitch": -90}


def _bbox(outline: Ring | list[Ring]) -> tuple[float, float, float, float]:
    """West, south, east, north of a ring or MultiPolygon, rounded outward to whole degrees."""
    rings = outline if isinstance(outline[0][0], (list, tuple)) else [outline]
    pts = [p for r in rings for p in r]  # type: ignore[union-attr]
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    return (math.floor(min(xs)), math.floor(min(ys)), math.ceil(max(xs)), math.ceil(max(ys)))


def _cam_fit(bbox: tuple[float, float, float, float], fill: float = 0.6) -> dict[str, float]:
    """Straight-down camera over the bbox centre, high enough that the bbox fills about
    `fill` of a 16:9 view. Cesium's 60-degree field of view spans the wider screen axis, so
    the view is 2*tan(30deg)*h wide and (9/16) of that tall."""
    w, s, e, n = bbox
    lat = (s + n) / 2
    width_m = (e - w) * 111_320 * math.cos(math.radians(lat))
    height_m = (n - s) * 110_570
    view_w = 2 * math.tan(math.radians(30))   # per metre of camera height
    view_h = view_w * 9 / 16
    h = max(width_m / (fill * view_w), height_m / (fill * view_h))
    return _cam((w + e) / 2, lat, round(h, -5))


def _sea(rid: str, name: str, outline: Ring | list[Ring], *notes: str) -> "RegionSpec":
    """A coastal sea with its own caveats (the writer adds a SYNTHETIC DATA note while its data are synthetic)."""
    bbox = _bbox(outline)
    return RegionSpec(rid, name, None, "coastal_sea", bbox, _cam_fit(bbox), outline, tuple(notes))


_BD_DIV_NAMES = {name for name, *_ in BD_DIVISIONS.values()}

REGIONS: list[RegionSpec] = [
    RegionSpec("greenland", "Greenland", None, "ice_sheet", (-74, 59, -10, 84),
               _cam(-42, 72, 4_500_000), GREENLAND),
    RegionSpec("antarctica", "Antarctica", None, "ice_sheet", (-180, -90, 180, -60),
               _cam(0, -90, 9_000_000), ANTARCTICA),
    RegionSpec("antarctica_west", "West Antarctica", "antarctica", "ice_sheet_basin", (-150, -90, -45, -72),
               _cam(-100, -80, 4_000_000), ANTARCTICA_WEST),
    # East Antarctica spans the antimeridian; its bbox uses the full longitude span (polar cap rule).
    RegionSpec("antarctica_east", "East Antarctica", "antarctica", "ice_sheet_basin", (-180, -90, 180, -65),
               _cam(80, -78, 6_500_000), ANTARCTICA_EAST),
    RegionSpec("antarctica_peninsula", "Antarctic Peninsula", "antarctica", "ice_sheet_basin", (-76, -75, -55, -63),
               _cam(-63, -68, 2_500_000), ANTARCTICA_PENINSULA),
    RegionSpec("global", "Global", None, "global", (-180, -90, 180, 90), _cam(0, 20, 20_000_000), None),
    # Bangladesh (M12): country outline from Natural Earth (public domain), see bangladesh.py.
    RegionSpec("bangladesh", "Bangladesh", None, "country", (88.0, 20.7, 92.7, 26.7), _cam(90.3, 23.6, 1_600_000),
               BANGLADESH,
               ("A mean over the whole country inside its border (Bangladesh Bureau of Statistics via geoBoundaries); not the value at any district.",)),
    # The 8 divisions of Bangladesh (M12), see bangladesh.py. Monsoon rainfall.
    # Names: "X Division" and, where a district shares its division's name, "X District" (unambiguous everywhere).
    *[RegionSpec(rid, f"{name} Division", "bangladesh", "division", bbox,
                 _cam((bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2, 700_000), rings,
                 (f"A mean over the whole {name} division; not the value at any district or town.",))
      for rid, (name, _iso, bbox, rings) in BD_DIVISIONS.items()],
    # The 64 districts (parent = their division), same source; monsoon rainfall only.
    *[RegionSpec(rid, f"{name} District" if name in _BD_DIV_NAMES else name, div, "district", bbox,
                 _cam((bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2, 350_000), rings,
                 (f"A mean over the whole {name} district; not the value at any town. IMERG cells are about 11 km, so a "
                  "small district averages only a handful of them.",))
      for rid, (name, div, bbox, rings) in BD_DISTRICTS.items()],
    # Coastal seas: sea_level only (contract: kind coastal_sea).
    _sea("bay_of_bengal", "Bay of Bengal (northern)", BAY_OF_BENGAL,
         "A mean over the open northern Bay, about 100 km from the coast; not the value at any town.",
         "The Ganges-Brahmaputra delta is sinking, so the rise people feel there is larger than this; land "
         "subsidence is not included.",
         "Monsoon winds and river runoff make this sea swing strongly within the year and between years."),
    _sea("gulf_of_mexico", "Gulf of Mexico", GULF_OF_MEXICO,
         "A mean over the open Gulf, about 100 km from the coast; not the value at any town.",
         "Land subsidence (for example around the Mississippi delta) is not included, so the local rise there "
         "is larger than this."),
    _sea("us_east_coast", "US Atlantic coast", US_EAST_COAST,
         "A mean over a band about 100-300 km offshore from Florida to the Gulf of Maine; not the value at any "
         "town or harbour.",
         "Land subsidence along the coast is not included, so the local rise is larger in many places."),
    _sea("western_tropical_pacific", "Western tropical Pacific", WESTERN_TROPICAL_PACIFIC,
         "A mean over the open sea east of the Philippines and north of New Guinea; not the value at any "
         "island or town.",
         "Swings strongly with El Nino, so a trend over a few decades can reflect a long swing.",
         "Land movement of the islands is not included."),
    _sea("north_sea", "North Sea", NORTH_SEA,
         "A mean over the open central and northern North Sea; the southern bight and the coasts are left out. "
         "Not the value at any town.",
         "Land movement (sinking or rising coasts) is not included."),
    _sea("mediterranean", "Mediterranean Sea", MEDITERRANEAN,
         "A mean over three open-sea parts (western basin, Tyrrhenian, and Ionian with the Levantine basin); the "
         "Adriatic and Aegean are left out. Not the value at any town.",
         "Land movement (sinking or rising coasts) is not included."),
]

# --------------------------------------------------------------------------- series


@dataclass(frozen=True)
class SeriesSpec:
    """One synthetic series. Dates are in the variable's frequency format."""
    start: str
    end: str
    slope: float                      # injected trend, units per year
    ar1: float                        # lag-1 autocorrelation of the noise
    noise_sd: float                   # marginal sd of the AR(1) noise
    start_value: float = 0.0          # trend line value at the first time step
    seasonal_amp: float = 0.0         # monthly only
    sigma: tuple[float, float] | None = None   # 1-sigma at (start, end); grows going back in time
    bounds: tuple[float, float] | None = None  # 1-sigma at (start, end) for 5-95% lower/upper
    gaps: int = 0                     # scattered interior nulls
    gap_window: tuple[float, float] = (0.05, 0.95)  # where gaps may fall, as fractions of the record
    early_gaps: int = 0               # extra nulls in the first 25% of the record (sparse early imagery)
    decimals: int = 2
    baseline: tuple[int, int] | None = None  # re-centre to a zero mean over these years (anomalies)
    segment_source: str | None = None        # overrides the variable's segment_source for this series


@dataclass(frozen=True)
class VariableSpec:
    id: str
    name: str
    units: str
    kind: str
    frequency: str
    series: dict[str, SeriesSpec]
    source: dict[str, str]
    segment_source: str
    describe: dict[str, str]
    notes: list[str]
    chart_types: list[str]
    map_mode: str | None = None
    group: str | None = None
    variant_of: str | None = None
    baseline: tuple[str, str] | None = None
    outlines: bool = False
    extra: dict[str, Any] = field(default_factory=dict)


SYNTH_NOTE = "SYNTHETIC DATA: generated with a known injected trend for testing; not a measurement."

_IMBIE = {
    "name": "Synthetic, shaped like IMBIE 2026",
    "url": "https://imbie.org/",
    "citation": "Synthetic data from pipeline/synthetic (Trend Detective). Shaped like the IMBIE Team "
                "ice sheet mass balance assessment; contains no IMBIE values.",
}
_ITSLIVE = {
    "name": "Synthetic, shaped like NSIDC-0793 ITS_LIVE",
    "url": "https://nsidc.org/data/nsidc-0793",
    "citation": "Synthetic data from pipeline/synthetic (Trend Detective). Shaped like the ITS_LIVE "
                "Greenland monthly ice masks; contains no NSIDC values.",
}
_MERRA2 = {
    "name": "Synthetic, shaped like NASA MERRA-2 M2TMNXSLV",
    "url": "https://disc.gsfc.nasa.gov/datasets/M2TMNXSLV_5.12.4/summary",
    "citation": "Synthetic data from pipeline/synthetic (Trend Detective). Shaped like MERRA-2 2 m air "
                "temperature anomalies; contains no MERRA-2 values.",
}
_NASA_SSH = {
    "name": "Synthetic, shaped like NASA-SSH gridded sea surface height V1.1",
    "url": "https://doi.org/10.5067/NSREF-SG0V11",
    "citation": "Synthetic data from pipeline/synthetic (Trend Detective). Weekly stand-in grids in the layout of "
                "NASA_SSH_REF_SIMPLE_GRID_V11, averaged by the real ingest code: the global mean over all ocean "
                "cells and each coastal sea over its polygon. Contains no NASA-SSH values.",
}
_SSH_GRID_SEGMENT = "Synthetic (NASA-SSH V1.1 grid stand-in, area mean over the sea polygon)"
_SSH_GLOBAL_SEGMENT = "Synthetic (NASA-SSH V1.1 grid stand-in, global area mean)"
_RECON = {
    "name": "Synthetic, shaped like NASA JPL_RECON_GMSL",
    "url": "https://podaac.jpl.nasa.gov/dataset/JPL_RECON_GMSL",
    "citation": "Synthetic data from pipeline/synthetic (Trend Detective). Shaped like the Frederikse et al. "
                "(2020) sea-level budget reconstruction; contains no JPL_RECON_GMSL values.",
}
_IMERG = {
    "name": "Synthetic, shaped like NASA GPM IMERG monthly precipitation",
    "url": "https://disc.gsfc.nasa.gov/datasets/GPM_3IMERGM_07/summary",
    "citation": "Synthetic data from pipeline/synthetic (Trend Detective). Shaped like GPM IMERG monthly "
                "precipitation; contains no IMERG values.",
}

_GRACE = {
    "name": "Synthetic, shaped like GRACE/GRACE-FO JPL mascons RL06.3",
    "url": "https://podaac.jpl.nasa.gov/dataset/TELLUS_GRAC-GRFO_MASCON_CRI_GRID_RL06.3_V4",
    "citation": "Synthetic data from pipeline/synthetic (Trend Detective). Shaped like the JPL GRACE/GRACE-FO "
                "mascon grids; contains no GRACE values.",
}

_ICE_REGIONS_NOTE = ("Sub-regions are generated independently, so West + East + Peninsula does not add up "
                     "exactly to Antarctica in this synthetic data.")

# ice_mass and ice_mass_rate are generated INDEPENDENTLY. A cumulative series with a
# linear trend has a constant rate, so the rate series below is not the derivative of
# the ice_mass series; each has its own injected trend for the M2 gate.
VARIABLES: list[VariableSpec] = [
    VariableSpec(
        id="ice_mass", group="ice_sheet", name="Ice mass", units="Gt", kind="cumulative", frequency="monthly",
        map_mode="ice_mass_map", chart_types=["series", "anomaly", "annual_change", "sea_level_equivalent"],
        source=_IMBIE, segment_source="Synthetic (IMBIE 2026 shape)",
        describe={"what": "How much ice an ice sheet holds, compared with the start of its record.",
                  "whyItMatters": "Ice lost from the ice sheets raises sea level; about 362 Gt is 1 mm."},
        notes=[SYNTH_NOTE, "Record starts in July 1971 for Greenland and 1979 for Antarctica.",
               "Uncertainty (1-sigma) is larger early in the record.", _ICE_REGIONS_NOTE],
        series={
            "greenland": SeriesSpec("1971-07", "2023-12", slope=-120.0, ar1=0.6, noise_sd=40.0,
                                    seasonal_amp=60.0, sigma=(250.0, 30.0), gaps=4, decimals=1),
            "antarctica": SeriesSpec("1979-01", "2023-12", slope=-90.0, ar1=0.6, noise_sd=60.0,
                                     seasonal_amp=30.0, sigma=(400.0, 50.0), decimals=1),
            "antarctica_west": SeriesSpec("1979-01", "2023-12", slope=-80.0, ar1=0.6, noise_sd=40.0,
                                          seasonal_amp=15.0, sigma=(200.0, 30.0), gaps=2, decimals=1),
            "antarctica_east": SeriesSpec("1979-01", "2023-12", slope=5.0, ar1=0.6, noise_sd=50.0,
                                          seasonal_amp=20.0, sigma=(300.0, 40.0), decimals=1),
            "antarctica_peninsula": SeriesSpec("1979-01", "2023-12", slope=-15.0, ar1=0.5, noise_sd=12.0,
                                               seasonal_amp=5.0, sigma=(60.0, 10.0), gaps=3, decimals=1),
        },
    ),
    VariableSpec(
        id="ice_mass_rate", group="ice_sheet", name="Ice mass change rate", units="Gt/yr", kind="rate", frequency="annual",
        map_mode="ice_mass_map", chart_types=["bar", "series"],
        source=_IMBIE, segment_source="Synthetic (IMBIE 2026 shape)",
        describe={"what": "How fast an ice sheet gains or loses ice each year.",
                  "whyItMatters": "A trend in the rate means the loss is speeding up or slowing down."},
        notes=[SYNTH_NOTE, "A trend in this series is an acceleration (Gt/yr per year).",
               "Generated independently of the ice mass series.", _ICE_REGIONS_NOTE],
        series={
            "greenland": SeriesSpec("1972", "2023", slope=-5.0, ar1=0.4, noise_sd=40.0, start_value=20.0,
                                    sigma=(60.0, 15.0), gaps=1, decimals=1),
            "antarctica": SeriesSpec("1979", "2023", slope=-3.5, ar1=0.3, noise_sd=50.0, start_value=10.0,
                                     sigma=(90.0, 25.0), decimals=1),
            "antarctica_west": SeriesSpec("1979", "2023", slope=-3.0, ar1=0.3, noise_sd=30.0, start_value=0.0,
                                          sigma=(60.0, 18.0), decimals=1),
            # Deliberate NO-TREND series: a steady small gain, no acceleration.
            "antarctica_east": SeriesSpec("1979", "2023", slope=0.0, ar1=0.3, noise_sd=25.0, start_value=5.0,
                                          sigma=(70.0, 20.0), decimals=1),
            "antarctica_peninsula": SeriesSpec("1979", "2023", slope=-0.6, ar1=0.3, noise_sd=12.0, start_value=0.0,
                                               sigma=(20.0, 6.0), decimals=1),
        },
    ),
    VariableSpec(
        id="ice_extent", group="ice_sheet", name="Ice extent", units="km2", kind="level", frequency="monthly",
        map_mode=None, outlines=True, chart_types=["series", "anomaly"],
        source=_ITSLIVE, segment_source="Synthetic (ITS_LIVE NSIDC-0793 shape)",
        describe={"what": "The area of Greenland covered by ice, month by month.",
                  "whyItMatters": "Retreating glacier fronts shrink the ice-covered area."},
        notes=[SYNTH_NOTE, "Greenland only.", "Early years have more missing months (sparse imagery).",
               "Outlines are coarse; the record is computed from 120 m masks we do not ship."],
        series={
            "greenland": SeriesSpec("1972-09", "2022-02", slope=-350.0, ar1=0.5, noise_sd=150.0,
                                    start_value=1_710_000.0, seasonal_amp=300.0, gaps=5, early_gaps=25,
                                    decimals=0),
        },
    ),
    VariableSpec(
        id="temperature", name="Summer air temperature", units="degC", kind="level", frequency="annual",
        map_mode="temperature", baseline=("1991", "2020"), chart_types=["series", "anomaly"],
        source=_MERRA2, segment_source="Synthetic (MERRA-2 shape)",
        describe={"what": "Summer air temperature near the surface, as a difference from the 1991-2020 average.",
                  "whyItMatters": "Warm summers drive surface melt on Greenland."},
        notes=[SYNTH_NOTE, "Greenland: June-August mean. Antarctica: December-February mean, labelled by the "
               "year of its January.", "Anomaly from the 1991-2020 average.",
               "Reanalysis, not direct measurement. Greenland summers from 1980, Antarctic summers from 1981 (the first full December-February in MERRA-2)."],
        series={
            "greenland": SeriesSpec("1980", "2026", slope=0.045, ar1=0.2, noise_sd=0.6, decimals=3,
                                    baseline=(1991, 2020)),
            # Deliberately noisy: a small real trend that is hard to detect.
            "antarctica": SeriesSpec("1981", "2026", slope=0.01, ar1=0.2, noise_sd=0.6, decimals=3,
                                     baseline=(1991, 2020)),
        },
    ),
    VariableSpec(
        id="sea_level", name="Sea level", units="mm", kind="level", frequency="monthly",
        map_mode=None, chart_types=["series", "anomaly"],
        source=_NASA_SSH, segment_source=_SSH_GRID_SEGMENT,
        describe={"what": "Sea level measured by satellites since 1993: the global mean, or the mean over "
                          "one coastal sea.",
                  "whyItMatters": "Rising seas threaten coasts worldwide, and some seas rise faster than "
                                  "the global mean."},
        notes=[SYNTH_NOTE,
               "Global: the mean over the whole ocean, not the value at any place.",
               "Coastal seas: the mean over the sea area drawn on the globe, not the value at a town or "
               "harbour, and not the rise people feel on land.",
               "Land subsidence is not included. Where the land sinks, the local rise is larger than shown.",
               "Satellite (absolute) sea level. Satellite data are less reliable near land, so each coastal-sea "
               "area keeps about 100 km away from the coast: it describes the open sea, not the shore.",
               "Coastal seas swing more from year to year (El Nino, monsoon, winds) than the global mean, so a "
               "trend there needs a longer record to stand out.",
               "Each coastal sea has its own notes, shown when it is selected.",
               "Global series not corrected for glacial isostatic adjustment.",
               "No per-point uncertainty in the source."],
        series={
            # gaps on global = number of months with failed grids (null in EVERY sea_level series).
            "global": SeriesSpec("1993-01", "2026-10", slope=3.3, ar1=0.6, noise_sd=3.0, start_value=-20.0,
                                 seasonal_amp=2.0, gaps=2, decimals=2, segment_source=_SSH_GLOBAL_SEGMENT),
            # Coastal seas: plausible SYNTHETIC rates, much larger interannual noise than
            # global (El Nino, monsoon, wind). Gulf of Mexico vs Mediterranean is the
            # clearly-different compare pair; North Sea vs global (same injected 3.3 mm/yr, decided
            # by main 2026-11-12) the indistinguishable sea-vs-global pair.
            "bay_of_bengal": SeriesSpec("1993-01", "2026-10", slope=3.9, ar1=0.7, noise_sd=12.0,
                                        start_value=-40.0, seasonal_amp=80.0, gaps=2, decimals=2,
                                        segment_source=_SSH_GRID_SEGMENT),
            "gulf_of_mexico": SeriesSpec("1993-01", "2026-10", slope=4.6, ar1=0.65, noise_sd=10.0,
                                         start_value=-45.0, seasonal_amp=70.0, gaps=2, decimals=2,
                                         segment_source=_SSH_GRID_SEGMENT),
            "us_east_coast": SeriesSpec("1993-01", "2026-10", slope=3.6, ar1=0.65, noise_sd=9.0,
                                        start_value=-35.0, seasonal_amp=50.0, gaps=2, decimals=2,
                                        segment_source=_SSH_GRID_SEGMENT),
            "western_tropical_pacific": SeriesSpec("1993-01", "2026-10", slope=4.5, ar1=0.8, noise_sd=15.0,
                                                   start_value=-45.0, seasonal_amp=30.0, gaps=2, decimals=2,
                                                   segment_source=_SSH_GRID_SEGMENT),
            "north_sea": SeriesSpec("1993-01", "2026-10", slope=3.3, ar1=0.6, noise_sd=12.0,
                                    start_value=-30.0, seasonal_amp=40.0, gaps=2, decimals=2,
                                    segment_source=_SSH_GRID_SEGMENT),
            "mediterranean": SeriesSpec("1993-01", "2026-10", slope=2.6, ar1=0.75, noise_sd=9.0,
                                        start_value=-25.0, seasonal_amp=60.0, gaps=2, decimals=2,
                                        segment_source=_SSH_GRID_SEGMENT),
        },
    ),
    VariableSpec(
        id="sea_level_long", variant_of="sea_level", name="Sea level, long record", units="mm", kind="level",
        frequency="annual", map_mode=None, chart_types=["series", "budget"],
        source=_RECON, segment_source="Synthetic (JPL_RECON_GMSL shape)",
        describe={"what": "Global mean sea level since 1900, reconstructed from tide gauges and models.",
                  "whyItMatters": "Shows how fast sea level rose before satellites."},
        notes=[SYNTH_NOTE, "Separate from the satellite record; never joined to it.", "Global only.",
               "Bounds are 5-95%."],
        series={
            "global": SeriesSpec("1900", "2018", slope=1.7, ar1=0.5, noise_sd=4.0, start_value=-170.0,
                                 bounds=(15.0, 3.0), decimals=2),
        },
    ),
    VariableSpec(
        id="ice_mass_long", variant_of="ice_mass", name="Ice mass, long record", units="Gt", kind="cumulative",
        frequency="annual", map_mode=None, chart_types=["series", "sea_level_equivalent"],
        source=_RECON, segment_source="Synthetic (JPL_RECON_GMSL GrIS/AIS shape)",
        describe={"what": "Ice sheet mass change since 1900, reconstructed.",
                  "whyItMatters": "Puts the satellite era in a longer context."},
        notes=[SYNTH_NOTE, "Separate from the IMBIE record; never joined to it.",
               "Greenland includes peripheral glaciers. Before 2003 (before gravity satellites) it rests on reconstructions from models, older images and field data.",
               "Bounds are 5-95%."],
        series={
            "greenland": SeriesSpec("1900", "2018", slope=-55.0, ar1=0.5, noise_sd=150.0, bounds=(900.0, 150.0),
                                    decimals=0),
            "antarctica": SeriesSpec("1900", "2018", slope=-10.0, ar1=0.5, noise_sd=300.0, bounds=(1800.0, 300.0),
                                     decimals=0),
        },
    ),
    # ---- Bangladesh (M12). Synthetic placeholder; `ingest imerg` replaces it with real data.
    VariableSpec(
        id="monsoon_rainfall", group="bangladesh", name="Monsoon rainfall", units="mm", kind="level",
        frequency="annual", map_mode=None, chart_types=["series", "anomaly"], baseline=("2001", "2020"),
        source=_IMERG, segment_source="Synthetic (IMERG-like)",
        describe={"what": "Total rain over Bangladesh in the monsoon months, June to September, from NASA's GPM "
                          "satellites (IMERG).",
                  "whyItMatters": "The monsoon brings most of the year's rain: too much floods rivers and fields, "
                                  "too little harms the rice harvest."},
        notes=[SYNTH_NOTE, "June-September total, averaged over the country, division or district.",
               "Rain varies a lot from year to year, so a trend needs many years to detect."],
        series={rid: SeriesSpec("2000", "2025", slope=0.0, ar1=0.1, noise_sd=220.0, start_value=1650.0, decimals=0)
                for rid in ["bangladesh", *BD_DIVISIONS, *BD_DISTRICTS]},
    ),
]

# --------------------------------------------------------------------------- map layers


@dataclass(frozen=True)
class LayerSpec:
    id: str
    units: str
    start: str
    end: str
    missing: list[str]
    scale: float
    offset: float
    source: dict[str, str]
    name: str | None = None  # manifest `name`: legend display name (optional)
    fade_near_zero: bool = False  # manifest `fadeNearZero`: values near 0 drawn transparent (mass change maps)


def _months(start: str, end: str) -> list[str]:
    y, m = map(int, start.split("-"))
    out = []
    while f"{y:04d}-{m:02d}" <= end:
        out.append(f"{y:04d}-{m:02d}")
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    return out


MAP_LAYERS: list[LayerSpec] = [
    LayerSpec("ice_mass_map", "cm w.e.", "2002-04", "2026-09",
              missing=_months("2017-07", "2018-05") + ["2002-06", "2003-06", "2011-01"],
              scale=0.05, offset=-1000.0, source=_GRACE, name="Ice mass change (GRACE-like, monthly)",
              fade_near_zero=True),
    LayerSpec("temperature", "degC", "1980-01", "2026-09", missing=[], scale=0.02, offset=-50.0, source=_MERRA2,
              name="Air temperature anomaly (monthly)"),
]

GRID_WIDTH, GRID_HEIGHT = 360, 180  # 1-degree global grid, row 0 = north edge
ATLAS_MAX = 4096
