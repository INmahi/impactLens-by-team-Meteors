"""Generate golden reference results for the TypeScript trend engine.

Runs the Python reference libraries (pymannkendall, scipy) on generated
series and writes inputs plus expected outputs to
packages/stats/test/golden.json.

Also writes the M5 golden cases (compare, correlate, sensitivity,
uncertainty, detectability) from golden_m5.py under the "m5" key.

Usage:  uv run python pipeline/stats/make_golden.py [n_cases]
"""
import json
import sys
from pathlib import Path

import numpy as np
import pymannkendall as mk
from scipy import stats

import golden_m5

OUT = Path(__file__).resolve().parents[2] / "packages" / "stats" / "test" / "golden.json"


def num(v):
    """JSON has no NaN; write null instead."""
    v = float(v)
    return v if np.isfinite(v) else None


def mk_dict(r):
    return {"trend": r.trend, "h": bool(r.h), "p": num(r.p), "z": num(r.z),
            "tau": num(r.Tau), "s": num(r.s), "var_s": num(r.var_s)}


def ar1_reference(x):
    """Mann-Kendall with a lag-1 effective-sample-size correction (reference)."""
    r0 = mk.original_test(x)
    ok = ~np.isnan(x)
    n = int(ok.sum())
    slope = mk.sens_slope(x).slope
    resid = x - np.arange(1, len(x) + 1) * slope      # NaN stays where data is missing
    y = resid - np.nanmean(resid)
    both = ok[:-1] & ok[1:]                           # pairs truly one step apart
    c1 = float(np.sum(y[:-1][both] * y[1:][both]))
    c0 = float(np.nansum(y * y))
    r = c1 / c0 * (n - 1) / int(both.sum())
    r = r + (1 + 4 * r) / n
    r = min(max(r, 0.0), 0.95)
    corr = (1 + r) / (1 - r)
    var_s = r0.var_s * corr
    s = r0.s
    z = 0.0 if s == 0 else (s - np.sign(s)) / np.sqrt(var_s)
    p = float(2 * stats.norm.sf(abs(z)))
    trend = "no trend" if p >= 0.05 else ("increasing" if z > 0 else "decreasing")
    return {"trend": trend, "h": p < 0.05, "p": p, "z": float(z), "tau": float(r0.Tau),
            "s": float(s), "var_s": float(var_s), "correction": float(corr)}


def sen_reference(y, t, inflation):
    """Theil-Sen interval with the variance of S multiplied by `inflation`."""
    dx = t[:, None] - t
    dy = y[:, None] - y
    slopes = np.sort(dy[dx > 0] / dx[dx > 0])
    z = stats.norm.ppf(0.025)
    n, nt = len(y), len(slopes)
    ties = sum(k * (k - 1) * (2 * k + 5) for k in np.unique(y, return_counts=True)[1] if k > 1)
    sigma = np.sqrt(inflation * (n * (n - 1) * (2 * n + 5) - ties) / 18.0)
    ru = min(int(np.round((nt - z * sigma) / 2.0)), nt - 1)
    rl = max(int(np.round((nt + z * sigma) / 2.0)) - 1, 0)
    return {"lower": float(slopes[rl]), "upper": float(slopes[ru])}


def make_series(rng, case):
    """A mix of lengths, trends, autocorrelation, seasonality, ties and gaps."""
    kind = case % 6
    n = int(rng.integers(12, 61)) if kind in (0, 1, 5) else int(rng.integers(60, 301))
    slope = float(rng.choice([0.0, 0.0, 0.02, -0.02, 0.1, -0.1]))
    phi = float(rng.choice([0.0, 0.3, 0.6, 0.85]))
    e = rng.normal(size=n)
    noise = np.empty(n)
    noise[0] = e[0]
    for i in range(1, n):
        noise[i] = phi * noise[i - 1] + e[i]
    x = slope * np.arange(n) + noise
    if kind in (2, 3):  # seasonal cycle
        x = x + 3.0 * np.sin(2 * np.pi * np.arange(n) / 12)
    if kind == 4:  # heavy ties
        x = np.round(x)
    if kind == 5:  # cumulative
        x = np.cumsum(x)
    if kind in (1, 3):  # gaps
        k = max(1, n // 10)
        x[rng.choice(n, size=k, replace=False)] = np.nan
    return x


def main():
    n_cases = int(sys.argv[1]) if len(sys.argv) > 1 else 1000
    rng = np.random.default_rng(20261114)
    cases = []
    for case in range(n_cases):
        x = make_series(rng, case)
        n = len(x)
        # Uneven time axis for Sen's slope: decimal years with jitter.
        t = 1975 + np.arange(n) / 12 + rng.uniform(0, 0.02, size=n)
        ok = ~np.isnan(x)
        ts = stats.theilslopes(x[ok], t[ok], alpha=0.95)
        ar1 = ar1_reference(x)
        cases.append({
            "ar1": ar1,
            "sen_wide": sen_reference(x[ok], t[ok], ar1["correction"]),
            "x": [None if np.isnan(v) else float(v) for v in x],
            "t": [float(v) for v in t],
            "original": mk_dict(mk.original_test(x)),
            "hamed_rao": mk_dict(mk.hamed_rao_modification_test(x)),
            "hamed_rao_lag3": mk_dict(mk.hamed_rao_modification_test(x, lag=3)),
            "tfpw": mk_dict(mk.trend_free_pre_whitening_modification_test(x)),
            "seasonal": mk_dict(mk.seasonal_test(x, period=12)) if n >= 36 else None,
            "sen": {"slope": float(ts[0]), "intercept": float(ts[1]),
                    "lower": float(ts[2]), "upper": float(ts[3])},
        })
    zs = [-8.0, -5.0, -3.0, -1.96, -1.0, -0.1, 0.0, 0.1, 1.0, 1.96, 3.0, 5.0, 8.0]
    ps = [1e-12, 1e-6, 0.001, 0.025, 0.2, 0.5, 0.8, 0.975, 0.999, 1 - 1e-6]
    golden = {
        "versions": {"numpy": np.__version__, "scipy": __import__("scipy").__version__,
                     "pymannkendall": mk.__version__},
        "norm": {"z": zs, "cdf": [float(stats.norm.cdf(z)) for z in zs],
                 "sf": [float(stats.norm.sf(z)) for z in zs],
                 "p": ps, "ppf": [float(stats.norm.ppf(p)) for p in ps]},
        "cases": cases,
        "m5": golden_m5.build(n_cases),
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(golden))
    print(f"wrote {len(cases)} cases to {OUT}")


if __name__ == "__main__":
    main()
