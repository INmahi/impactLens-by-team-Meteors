"""Golden cases for the M5 additions (compare, correlate, sensitivity,
uncertainty, detectability, random numbers, Student t).

Called by make_golden.py, which stores the result under the "m5" key of
packages/stats/test/golden.json. Checked by packages/stats/test/m5.test.ts.
"""
from __future__ import annotations

import math

import numpy as np
from scipy import stats

import reference_m5 as ref


def _clean(v):
    """JSON has no NaN; write null instead (recursively)."""
    if isinstance(v, dict):
        return {k: _clean(x) for k, x in v.items()}
    if isinstance(v, (list, tuple)):
        return [_clean(x) for x in v]
    if isinstance(v, (bool, np.bool_)):
        return bool(v)
    if isinstance(v, (int, np.integer)):
        return int(v)
    if isinstance(v, (float, np.floating)):
        return float(v) if math.isfinite(v) else None
    return v


def _dates(freq, y0, m0, n):
    if freq == "annual":
        return [f"{y0 + i:04d}" for i in range(n)]
    out = []
    y, m = y0, m0
    for _ in range(n):
        out.append(f"{y:04d}-{m:02d}")
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    return out


def _ar1(rng, n, phi):
    e = rng.normal(size=n)
    out = np.empty(n)
    out[0] = e[0]
    for i in range(1, n):
        out[i] = phi * out[i - 1] + math.sqrt(1 - phi * phi) * e[i]
    return out


def _series(rng, freq, y0, m0, n, slope, phi, sd, shared=None, seasonal=0.0, gaps=0, decimals=None,
            sigma=None, kind="level"):
    noise = _ar1(rng, n, phi)
    if shared is not None:
        noise = 0.6 * shared[:n] + 0.8 * noise
    k = 12 if freq == "monthly" else 1
    i = np.arange(n)
    v = slope * i / k + sd * noise
    if freq == "monthly" and seasonal:
        months = (m0 - 1 + i) % 12
        v = v + seasonal * np.sin(2 * np.pi * months / 12)
    if decimals is not None:
        v = np.round(v, decimals)
    vals = [float(x) for x in v]
    if gaps:
        for j in rng.choice(np.arange(1, n - 1), size=gaps, replace=False):
            vals[int(j)] = None
    s = {"dates": _dates(freq, y0, m0, n), "values": vals, "frequency": freq, "kind": kind}
    if sigma is not None:
        s["sigma"] = sigma
    return s


def _pair(rng, case):
    """Two overlapping series: same or mixed frequency, offsets, gaps, shared signal."""
    kind = case % 5
    phi = float(rng.choice([0.0, 0.3, 0.6, 0.8]))
    shared = _ar1(rng, 400, phi)
    if kind in (0, 1):  # monthly vs monthly
        na, nb = int(rng.integers(96, 181)), int(rng.integers(96, 181))
        off = int(rng.integers(0, 24)) if kind == 1 else 0
        a = _series(rng, "monthly", 1993, 1, na, float(rng.normal(3, 1)), phi, float(rng.uniform(2, 12)),
                    shared, seasonal=float(rng.uniform(0, 60)), gaps=2 * (kind == 1))
        b = _series(rng, "monthly", 1993 + off // 12, 1 + off % 12, nb, float(rng.normal(3, 1)), phi,
                    float(rng.uniform(2, 12)), shared[off:], seasonal=float(rng.uniform(0, 60)),
                    gaps=2 * (kind == 1), decimals=1 if case % 7 == 0 else None)
    elif kind in (2, 4):  # annual vs annual
        na, nb = int(rng.integers(20, 53)), int(rng.integers(20, 53))
        off = int(rng.integers(0, 8))
        a = _series(rng, "annual", 1972, 0, na, float(rng.normal(-5, 2)), phi, 40.0, shared,
                    gaps=int(rng.integers(0, 3)), kind="rate")
        b = _series(rng, "annual", 1972 + off, 0, nb, float(rng.normal(-4, 2)), phi, 50.0, shared[off:],
                    gaps=int(rng.integers(0, 3)), kind="rate")
    else:  # monthly vs annual
        na, nb = int(rng.integers(120, 241)), int(rng.integers(15, 31))
        a = _series(rng, "monthly", 1990, int(rng.integers(1, 13)), na, 0.05, phi, 0.5,
                    seasonal=float(rng.uniform(0, 5)), gaps=3)
        b = _series(rng, "annual", 1988, 0, nb, float(rng.normal(-5, 2)), phi, 40.0, kind="rate")
    rng_start = rng_end = None
    if kind == 4:
        lo = max(int(a["dates"][0]), int(b["dates"][0]))
        rng_start = str(lo + 2)
        rng_end = str(lo + 2 + int(rng.integers(12, 18)))
    return a, b, rng_start, rng_end


def build(n_cases: int = 1000) -> dict:
    scale = max(0.05, n_cases / 1000)
    rng = np.random.default_rng(20261113)
    out: dict = {}

    # Random numbers.
    r = ref.Rng(12345)
    u32 = [r.next_u32() for _ in range(10000)]
    r = ref.Rng(2**31 + 7)
    uni = [r.uniform() for _ in range(200)]
    ints = [r.int(37) for _ in range(200)]
    norms = [r.normal() for _ in range(2000)]
    out["rng"] = {"seed_u32": 12345, "u32": u32, "seed_mix": 2**31 + 7, "uniform": uni, "int37": ints, "normal": norms}

    # Student t.
    ts = [-30.0, -5.0, -2.0, -0.5, 0.0, 0.3, 1.0, 1.96, 2.5, 4.0, 8.0, 40.0]
    dfs = [1.0, 1.5, 2.0, 3.0, 4.7, 10.0, 28.3, 43.0, 100.0, 404.0]
    ps = [0.0005, 0.025, 0.1, 0.5, 0.9, 0.975, 0.9995]
    out["t"] = {
        "t": ts, "df": dfs, "p": ps,
        "sf": [[float(stats.t.sf(t, d)) for t in ts] for d in dfs],
        "two": [[float(min(1.0, 2 * stats.t.sf(abs(t), d))) for t in ts] for d in dfs],
        "ppf": [[float(stats.t.ppf(p, d)) for p in ps] for d in dfs],
    }

    cases = []
    for i in range(max(5, int(60 * scale))):
        a, b, s, e = _pair(rng, i)
        res = ref.compare(a, b, s, e, replicates=199, seed=1000 + i)
        cases.append({"a": a, "b": b, "start": s, "end": e, "seed": 1000 + i, "replicates": 199, "want": res})
    out["compare"] = cases

    cases = []
    for i in range(max(5, int(60 * scale))):
        a, b, s, e = _pair(rng, i + 1)
        lag = int(rng.integers(0, 4))
        cases.append({"x": a, "y": b, "start": s, "end": e, "max_lag": lag,
                      "want": ref.correlate(a, b, s, e, lag)})
    out["correlate"] = cases

    cases = []
    statsmodels_checked = 0
    for i in range(max(5, int(60 * scale))):
        n = int(rng.integers(20, 50))
        phi = float(rng.choice([0.0, 0.3, 0.6]))
        temp = _series(rng, "annual", 1980, 0, n, 0.04, 0.2, 0.6, gaps=int(i % 3 == 0))
        sens = float(rng.normal(-60, 30))
        tv = np.array([math.nan if v is None else v for v in temp["values"]])
        noise = _ar1(rng, n, phi) * 40
        rate_vals = [None if not math.isfinite(x) else float(sens * x + nz) for x, nz in zip(tv, noise)]
        off = int(rng.integers(0, 6))
        rate = {"dates": temp["dates"][off:], "values": rate_vals[off:], "frequency": "annual", "kind": "rate"}
        if i % 4 == 1:
            rate["values"][len(rate["values"]) // 2] = None
        lag = int(rng.integers(0, 4))
        want = ref.sensitivity(rate, temp, None, None, lag)
        statsmodels_checked += int(want["levels"]["contiguous"]) + int(want["detrended"]["contiguous"])
        cases.append({"response": rate, "driver": temp, "lag": lag, "want": want})
    out["sensitivity"] = cases
    out["sensitivity_statsmodels_checked"] = statsmodels_checked

    cases = []
    for i in range(max(4, int(30 * scale))):
        monthly = i % 3 == 0
        n = int(rng.integers(60, 151)) if monthly else int(rng.integers(20, 50))
        freq = "monthly" if monthly else "annual"
        mode = i % 4
        if mode == 0:
            sig = [5.0] * n
        elif mode == 1:
            sig = [float(10 + 2 * j) for j in range(n)]          # growing (cumulative-style)
        elif mode == 2:
            sig = [float(abs(x)) for x in rng.normal(8, 3, size=n)]
        else:
            sig = [None if j % 9 == 4 else 6.0 for j in range(n)]
        s = _series(rng, freq, 1992, 4 if monthly else 0, n, -3.0, 0.4, 10.0, seasonal=20.0 * monthly,
                    gaps=2, sigma=sig, kind="cumulative" if mode == 1 else "level")
        cases.append({"series": s, "draws": 150, "seed": 77 + i, "want": ref.uncertainty(s, draws=150, seed=77 + i)})
    out["uncertainty"] = cases

    cases = []
    for i in range(max(5, int(80 * scale))):
        monthly = i % 2 == 0
        n = int(rng.integers(120, 400)) if monthly else int(rng.integers(15, 60))
        freq = "monthly" if monthly else "annual"
        slope = float(rng.choice([0.0, 0.02, 0.05, 0.2, -0.1]))
        s = _series(rng, freq, 1985, 1 if monthly else 0, n, slope, float(rng.choice([0.0, 0.3, 0.6, 0.85])),
                    1.0, seasonal=2.0 * monthly, gaps=int(rng.integers(0, 3)))
        st = en = None
        if i % 5 == 1:
            st = s["dates"][3]
            en = s["dates"][-4]
        power = float(rng.choice([0.8, 0.9]))
        cases.append({"series": s, "start": st, "end": en, "power": power,
                      "want": ref.detectability(s, st, en, power=power)})
    out["detect"] = cases
    return _clean(out)
