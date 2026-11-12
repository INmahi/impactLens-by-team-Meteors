"""Synthetic time series: injected linear trend + AR(1) noise (+ seasonal cycle).

Time is real decimal years at the middle of each step, the same convention as
analyzeTrend(): monthly t = year + (month - 0.5) / 12, annual t = year + 0.5.
"""

from __future__ import annotations

import zlib
from typing import Any

import numpy as np

from .config import SeriesSpec, VariableSpec

Z95 = 1.6448536269514722  # 5-95% bounds = +-1.645 sigma


def monthly_dates(start: str, end: str) -> list[str]:
    y, m = map(int, start.split("-"))
    out = []
    while f"{y:04d}-{m:02d}" <= end:
        out.append(f"{y:04d}-{m:02d}")
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    return out


def annual_dates(start: str, end: str) -> list[str]:
    return [f"{y:04d}" for y in range(int(start), int(end) + 1)]


def dates_for(freq: str, start: str, end: str) -> list[str]:
    return monthly_dates(start, end) if freq == "monthly" else annual_dates(start, end)


def decimal_years(dates: list[str]) -> np.ndarray:
    out = []
    for d in dates:
        if "-" in d:
            y, m = map(int, d.split("-"))
            out.append(y + (m - 0.5) / 12)
        else:
            out.append(int(d) + 0.5)
    return np.array(out, dtype=float)


def stream(seed: int, *keys: str) -> np.random.Generator:
    """An independent random stream per (seed, keys), stable when other series are added."""
    return np.random.default_rng([seed, *(zlib.crc32(k.encode("utf-8")) for k in keys)])


def ar1_noise(rng: np.random.Generator, n: int, phi: float, sd: float) -> np.ndarray:
    """Stationary AR(1) with lag-1 autocorrelation phi and marginal sd."""
    z = rng.standard_normal(n)
    e = np.empty(n)
    e[0] = sd * z[0]
    innov = sd * np.sqrt(1.0 - phi * phi)
    for i in range(1, n):
        e[i] = phi * e[i - 1] + innov * z[i]
    return e


def _r(x: float, decimals: int) -> float | int:
    v = round(float(x), decimals)
    if decimals <= 0:
        return int(v)
    return v + 0.0  # turns -0.0 into 0.0


def make_series(var: VariableSpec, region: str, spec: SeriesSpec, seed: int) -> dict[str, Any]:
    rng = stream(seed, var.id, region)
    freq = var.frequency
    dates = dates_for(freq, spec.start, spec.end)
    n = len(dates)
    t = decimal_years(dates)
    trend = spec.start_value + spec.slope * (t - t[0])
    noise = ar1_noise(rng, n, spec.ar1, spec.noise_sd)
    seasonal = np.zeros(n)
    if freq == "monthly" and spec.seasonal_amp:
        months = np.array([int(d[5:7]) for d in dates])
        phase = rng.uniform(0, 2 * np.pi)
        seasonal = spec.seasonal_amp * np.sin(2 * np.pi * (months - 1) / 12 + phase)
    values = trend + noise + seasonal
    if spec.baseline is not None:
        # Anomalies: zero mean over the baseline years (a constant shift; the slope is unchanged).
        years = np.floor(t).astype(int)
        in_base = (years >= spec.baseline[0]) & (years <= spec.baseline[1])
        values = values - values[in_base].mean()

    # Scattered interior gaps: never the first or last two steps.
    gaps: set[int] = set()
    if spec.gaps:
        lo = max(2, int(spec.gap_window[0] * n))
        hi = min(n - 3, int(spec.gap_window[1] * n))
        gaps |= set(int(i) for i in rng.choice(np.arange(lo, hi + 1), size=spec.gaps, replace=False))
    if spec.early_gaps:
        pool = np.array([i for i in range(2, int(0.25 * n)) if i not in gaps])
        gaps |= set(int(i) for i in rng.choice(pool, size=spec.early_gaps, replace=False))

    # Uncertainty grows going back in time: 1-sigma from spec at the start to spec at the end.
    frac_back = (t[-1] - t) / (t[-1] - t[0])  # 1 at the start, 0 at the end
    def grow(pair: tuple[float, float]) -> np.ndarray:
        old, new = pair
        return new + (old - new) * frac_back ** 1.5

    vals: list[float | int | None] = [None if i in gaps else _r(values[i], spec.decimals) for i in range(n)]
    doc: dict[str, Any] = {
        "variable": var.id, "region": region, "units": var.units, "frequency": freq, "kind": var.kind,
        "dates": dates, "values": vals,
    }
    if spec.sigma is not None:
        sig = grow(spec.sigma)
        doc["sigma"] = [None if i in gaps else _r(sig[i], spec.decimals) for i in range(n)]
    if spec.bounds is not None:
        half = Z95 * grow(spec.bounds)
        lower, upper = [], []
        for i in range(n):
            if vals[i] is None:
                lower.append(None)
                upper.append(None)
            else:
                lower.append(_r(vals[i] - half[i], spec.decimals))
                upper.append(_r(vals[i] + half[i], spec.decimals))
        doc["lower"], doc["upper"], doc["bounds"] = lower, upper, "5-95%"
    doc["segments"] = [{"source": var.segment_source, "start": dates[0], "end": dates[-1], "offset": 0}]
    doc["synthetic"] = True
    doc["injected"] = {"slopePerYear": spec.slope, "ar1": spec.ar1, "noiseSd": spec.noise_sd}
    return doc


def all_series(variables: list[VariableSpec], seed: int) -> dict[tuple[str, str], dict[str, Any]]:
    return {(v.id, rid): make_series(v, rid, spec, seed) for v in variables for rid, spec in v.series.items()}


def trend_input(doc: dict[str, Any]) -> dict[str, Any]:
    """The TrendInput the validator uses for rule 6 (default alpha, no range)."""
    return {k: doc[k] for k in ("dates", "values", "frequency", "kind")}
