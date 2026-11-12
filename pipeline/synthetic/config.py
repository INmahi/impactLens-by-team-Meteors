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

from dataclasses import dataclass, field
from typing import Any

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


@dataclass(frozen=True)
class RegionSpec:
    id: str
    name: str
    parent: str | None
    kind: str  # ice_sheet | ice_sheet_basin | glacier_region | global
    bbox: tuple[float, float, float, float]
    camera: dict[str, float]
    # None for kind "global"; one ring for a Polygon; a list of rings for a MultiPolygon.
    outline: Ring | list[Ring] | None


def _cam(lon: float, lat: float, height: float) -> dict[str, float]:
    return {"lon": lon, "lat": lat, "height": height, "heading": 0, "pitch": -90}


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
    "name": "Synthetic, shaped like NASA-SSH GMSL indicator",
    "url": "https://podaac.jpl.nasa.gov/dataset/NASA_SSH_GMSL_INDICATOR",
    "citation": "Synthetic data from pipeline/synthetic (Trend Detective). Shaped like the NASA-SSH global "
                "mean sea level indicator; contains no NASA-SSH values.",
}
_RECON = {
    "name": "Synthetic, shaped like NASA JPL_RECON_GMSL",
    "url": "https://podaac.jpl.nasa.gov/dataset/JPL_RECON_GMSL",
    "citation": "Synthetic data from pipeline/synthetic (Trend Detective). Shaped like the Frederikse et al. "
                "(2020) sea-level budget reconstruction; contains no JPL_RECON_GMSL values.",
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
                  "whyItMatters": "Ice lost from the ice sheets raises sea level; about 360 Gt is 1 mm."},
        notes=[SYNTH_NOTE, "Record starts in 1972 for Greenland and 1979 for Antarctica.",
               "Uncertainty (1-sigma) is larger early in the record.", _ICE_REGIONS_NOTE],
        series={
            "greenland": SeriesSpec("1972-01", "2023-12", slope=-120.0, ar1=0.6, noise_sd=40.0,
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
        id="ice_mass_rate", group="ice_sheet", name="Ice loss rate", units="Gt/yr", kind="rate", frequency="annual",
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
               "Reanalysis, not direct measurement. About 3 years short of 50."],
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
        source=_NASA_SSH, segment_source="Synthetic (NASA-SSH GMSL indicator shape)",
        describe={"what": "Global mean sea level measured by satellites since 1993.",
                  "whyItMatters": "Rising seas threaten coasts worldwide."},
        notes=[SYNTH_NOTE, "Global only; local sea level differs.",
               "Not corrected for glacial isostatic adjustment.", "No per-point uncertainty in the source."],
        series={
            "global": SeriesSpec("1993-01", "2026-10", slope=3.3, ar1=0.6, noise_sd=3.0, start_value=-20.0,
                                 seasonal_amp=2.0, gaps=2, decimals=2),
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
               "Greenland includes peripheral glaciers. Before 2003 it rests on models and in-situ data.",
               "Bounds are 5-95%."],
        series={
            "greenland": SeriesSpec("1900", "2018", slope=-55.0, ar1=0.5, noise_sd=150.0, bounds=(900.0, 150.0),
                                    decimals=0),
            "antarctica": SeriesSpec("1900", "2018", slope=-10.0, ar1=0.5, noise_sd=300.0, bounds=(1800.0, 300.0),
                                     decimals=0),
        },
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
              scale=0.05, offset=-1000.0, source=_GRACE),
    LayerSpec("temperature", "degC", "1980-01", "2026-09", missing=[], scale=0.02, offset=-50.0, source=_MERRA2),
]

GRID_WIDTH, GRID_HEIGHT = 360, 180  # 1-degree global grid, row 0 = north edge
ATLAS_MAX = 4096
