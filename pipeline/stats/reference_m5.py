"""Python reference for the M5 statistics additions in packages/stats.

compare, correlate, sensitivity, uncertainty and detectability, written
independently of the TypeScript engine and checked against it by
packages/stats/test/m5.test.ts through golden data written by make_golden.py.

Where the TypeScript engine relies on simple arithmetic in a set order
(seasonal-cycle removal, lag-1 autocorrelation), this file uses the same
order so results agree to rounding. Independent library checks:
pymannkendall (Mann-Kendall S and its variance), scipy (Theil-Sen slope,
Pearson, Spearman, normal and Student t distributions) and statsmodels
(OLS with HAC errors; asserted equal on series without interior gaps).

Decisions: docs/stats/decisions.md (D2-D7).
"""
from __future__ import annotations

import math

import numpy as np
import pymannkendall as mk
from scipy import stats

M32 = 0xFFFFFFFF


# ---------------------------------------------------------------------------
# D2.1 Seeded random numbers (xoshiro128**, splitmix32 seeding)

def _rotl(x: int, k: int) -> int:
    return ((x << k) | (x >> (32 - k))) & M32


class Rng:
    def __init__(self, seed: int):
        a = int(seed) & M32

        def splitmix32() -> int:
            nonlocal a
            a = (a + 0x9E3779B9) & M32
            t = a
            t = ((t ^ (t >> 16)) * 0x21F0AAAD) & M32
            t = ((t ^ (t >> 15)) * 0x735A2D97) & M32
            return (t ^ (t >> 15)) & M32

        self.s = [splitmix32(), splitmix32(), splitmix32(), splitmix32()]
        if not any(self.s):
            self.s[0] = 1

    def next_u32(self) -> int:
        s0, s1, s2, s3 = self.s
        result = (_rotl((s1 * 5) & M32, 7) * 9) & M32
        t = (s1 << 9) & M32
        s2 ^= s0
        s3 ^= s1
        s1 ^= s2
        s0 ^= s3
        s2 ^= t
        s3 = _rotl(s3, 11)
        self.s = [s0, s1, s2, s3]
        return result

    def uniform(self) -> float:
        return self.next_u32() / 4294967296.0

    def int(self, k: int) -> int:
        return math.floor(self.uniform() * k)

    def normal(self) -> float:
        u1 = self.uniform()
        u2 = self.uniform()
        return math.sqrt(-2.0 * math.log(1.0 - u1)) * math.cos(2.0 * math.pi * u2)


# ---------------------------------------------------------------------------
# Sen's slope, seasonal cycle, lag-1 autocorrelation

def sen_slope(t, y) -> float:
    """Median of pairwise slopes over finite points (scipy.stats.theilslopes slope)."""
    t = np.asarray(t, float)
    y = np.asarray(y, float)
    ok = np.isfinite(t) & np.isfinite(y)
    t, y = t[ok], y[ok]
    if len(y) < 2:
        return math.nan
    dx = t[:, None] - t
    dy = y[:, None] - y
    pos = dx > 0
    if not pos.any():
        return math.nan
    return float(np.median(dy[pos] / dx[pos]))


def sen_interval(t, y, inflation: float):
    """Theil-Sen 95% interval with Var(S) multiplied by `inflation` (as senSlope in TS)."""
    t = np.asarray(t, float)
    y = np.asarray(y, float)
    ok = np.isfinite(t) & np.isfinite(y)
    t, y = t[ok], y[ok]
    dx = t[:, None] - t
    dy = y[:, None] - y
    pos = dx > 0
    slopes = np.sort(dy[pos] / dx[pos])
    n, m = len(y), len(slopes)

    def ties(v):
        return sum(k * (k - 1) * (2 * k + 5) for k in np.unique(v, return_counts=True)[1] if k > 1)

    z = stats.norm.ppf(0.025)
    sigma = math.sqrt(inflation * (n * (n - 1) * (2 * n + 5) - ties(t) - ties(y)) / 18.0)
    ru = min(int(np.round((m - z * sigma) / 2.0)), m - 1)
    rl = max(int(np.round((m + z * sigma) / 2.0)) - 1, 0)
    return float(slopes[rl]), float(slopes[ru])


def index_slope(values) -> float:
    return sen_slope(np.arange(len(values), dtype=float), values)


def deseasonalize(values, period=12):
    s = [0.0] * period
    c = [0] * period
    for i, v in enumerate(values):
        if math.isfinite(v):
            s[i % period] += v
            c[i % period] += 1
    out = []
    for i, v in enumerate(values):
        k = i % period
        out.append(v - s[k] / c[k] if math.isfinite(v) and c[k] > 0 else math.nan)
    return out


def deseasonalize_with_trend(values, period=12):
    first = deseasonalize(values, period)
    slope = index_slope(first)
    if not math.isfinite(slope):
        return first
    detr = [v - i * slope for i, v in enumerate(values)]
    free = deseasonalize(detr, period)
    return [values[i] - (detr[i] - free[i]) if math.isfinite(free[i]) else math.nan for i in range(len(values))]


def lag1(resid, min_n=8):
    """Gap-aware lag-1 autocorrelation with the headline bias correction and clipping."""
    n = 0
    mean = 0.0
    for v in resid:
        if math.isfinite(v):
            mean += v
            n += 1
    mean = mean / n if n else math.nan
    c0 = c1 = 0.0
    pairs = 0
    L = len(resid)
    for i in range(L):
        if not math.isfinite(resid[i]):
            continue
        a = resid[i] - mean
        c0 += a * a
        if i + 1 < L and math.isfinite(resid[i + 1]):
            c1 += a * (resid[i + 1] - mean)
            pairs += 1
    sd = math.sqrt(c0 / (n - 1)) if n > 1 else math.nan
    if n < min_n or pairs < 4 or not c0 > 0:
        return {"r": 0.0, "sd": sd, "n": n, "valid": False}
    r_raw = c1 / c0 * (n - 1) / pairs
    r = r_raw + (1 + 4 * r_raw) / n
    r = min(max(r, 0.0), 0.95)
    return {"r": r, "sd": sd, "n": n, "valid": True}


def index_residuals(values):
    slope = index_slope(values)
    return [v - (i + 1) * slope if math.isfinite(v) else math.nan for i, v in enumerate(values)]


def time_residuals(t, y):
    slope = sen_slope(t, y)
    return [y[i] - slope * t[i] if math.isfinite(y[i]) else math.nan for i in range(len(y))]


def ar1_mk(y, alpha=0.05):
    """Headline test (ar1MannKendall) on a grid with NaN: S and Var(S) from pymannkendall."""
    x = np.asarray(y, float)
    fin = x[np.isfinite(x)]
    r0 = mk.original_test(fin)
    est = lag1(index_residuals(list(x)))
    corr = (1 + est["r"]) / (1 - est["r"]) if est["valid"] else 1.0
    var_s = r0.var_s * corr
    s = r0.s
    z = 0.0 if s == 0 else (s - np.sign(s)) / math.sqrt(var_s)
    p = float(2 * stats.norm.sf(abs(z)))
    return {"s": float(s), "var_s": float(var_s), "z": float(z), "p": p, "tau": float(r0.Tau),
            "significant": p < alpha, "correction": corr}


# ---------------------------------------------------------------------------
# D2.2 Series on one time axis

def _parse(d: str):
    parts = d.split("-")
    return int(parts[0]), (int(parts[1]) if len(parts) > 1 else 0)


def _num(v):
    return math.nan if v is None else float(v)


def normalise_bound(d, frequency, which):
    if d is None:
        return None
    y, m = _parse(d)
    if frequency == "annual":
        return f"{y:04d}"
    if m == 0:
        return f"{y:04d}-{'01' if which == 'start' else '12'}"
    return d


def valid_span(s, start=None, end=None):
    first = last = None
    for d, v in zip(s["dates"], s["values"]):
        if start is not None and d < start:
            continue
        if end is not None and d > end:
            continue
        if not math.isfinite(_num(v)):
            continue
        first = d if first is None or d < first else first
        last = d if last is None or d > last else last
    return None if first is None else (first, last)


def grid_series(s, start, end):
    oy, _ = _parse(start)
    ey, em = _parse(end)
    monthly = s["frequency"] == "monthly"
    size = (ey - oy) * 12 + em if monthly else ey - oy + 1
    raw = [math.nan] * size
    sig = [math.nan] * size
    sigma = s.get("sigma")
    for i, d in enumerate(s["dates"]):
        if d < start or d > end:
            continue
        y, m = _parse(d)
        k = (y - oy) * 12 + (m - 1) if monthly else y - oy
        if 0 <= k < size:
            raw[k] = _num(s["values"][i])
            if sigma is not None:
                sig[k] = _num(sigma[i])
    yv = deseasonalize_with_trend(raw, 12) if monthly else list(raw)
    t = [oy + (i + 0.5) / 12 if monthly else oy + i + 0.5 for i in range(size)]
    return {"t": t, "y": yv, "raw": raw, "sigma": sig, "n": sum(1 for v in yv if math.isfinite(v)),
            "origin": oy}


def to_annual(s, start_year=None, end_year=None, min_months=9):
    if s["frequency"] == "annual":
        return s
    lo = None if start_year is None else f"{start_year:04d}-01"
    hi = None if end_year is None else f"{end_year:04d}-12"
    ds = [d for d in s["dates"] if (lo is None or d >= lo) and (hi is None or d <= hi)]
    g = grid_series(s, min(ds), max(ds))
    n_years = math.ceil(len(g["y"]) / 12)
    dates, values = [], []
    for k in range(n_years):
        tot, cnt = 0.0, 0
        for m in range(12):
            idx = k * 12 + m
            if idx < len(g["y"]) and math.isfinite(g["y"][idx]):
                tot += g["y"][idx]
                cnt += 1
        dates.append(f"{g['origin'] + k:04d}")
        values.append(tot / cnt if cnt >= min_months else None)
    return {"dates": dates, "values": values, "frequency": "annual", "kind": s.get("kind")}


def align_pair(a, b, start=None, end=None):
    freq = "monthly" if a["frequency"] == "monthly" and b["frequency"] == "monthly" else "annual"
    if freq == "annual":
        sy = None if start is None else _parse(start)[0]
        ey = None if end is None else _parse(end)[0]
        a = to_annual(a, sy, ey)
        b = to_annual(b, sy, ey)
    lo = normalise_bound(start, freq, "start")
    hi = normalise_bound(end, freq, "end")
    sa, sb = valid_span(a, lo, hi), valid_span(b, lo, hi)
    s = max(sa[0], sb[0])
    e = min(sa[1], sb[1])
    if s > e:
        raise ValueError("no overlap")
    return freq, a, b, s, e


def headline(g):
    """Sen slope and corrected 95% interval as analyzeTrend reports them."""
    slope = sen_slope(g["t"], g["y"])
    est = lag1(index_residuals(g["y"]))
    corr = (1 + est["r"]) / (1 - est["r"]) if est["valid"] else 1.0
    lo, hi = sen_interval(g["t"], g["y"], corr)
    return slope, lo, hi, corr


# ---------------------------------------------------------------------------
# D3 Compare two regions

def block_length(r, n):
    g = 2 * r / (1 - r * r)
    raw = math.ceil(1.5 ** (1 / 3) * g ** (2 / 3) * n ** (1 / 3))
    return max(1, min(n // 2, raw))


def _pearson_loop(x, y):
    n = len(x)
    mx = sum(x) / n
    my = sum(y) / n
    sxx = syy = sxy = 0.0
    for a, b in zip(x, y):
        sxx += (a - mx) ** 2
        syy += (b - my) ** 2
        sxy += (a - mx) * (b - my)
    if not (sxx > 0 and syy > 0):
        return 0.0
    return max(-1.0, min(1.0, sxy / math.sqrt(sxx * syy)))


def compare(a, b, start=None, end=None, alpha=0.05, replicates=1000, seed=20261113):
    freq, a, b, s, e = align_pair(a, b, start, end)
    ga, gb = grid_series(a, s, e), grid_series(b, s, e)
    t = np.array(ga["t"])
    ya, yb = np.array(ga["y"]), np.array(gb["y"])
    N = len(t)
    common = int(np.sum(np.isfinite(ya) & np.isfinite(yb)))
    slope_a, lo_a, hi_a, _ = headline(ga)
    slope_b, lo_b, hi_b, _ = headline(gb)
    d = slope_a - slope_b
    z95 = stats.norm.ppf(0.975)
    se_a = (hi_a - lo_a) / (2 * z95)
    se_b = (hi_b - lo_b) / (2 * z95)

    r = max(lag1(index_residuals(ga["y"]))["r"], lag1(index_residuals(gb["y"]))["r"])
    L = block_length(r, N)
    ea = ya - slope_a * t
    eb = yb - slope_b * t
    rng = Rng(seed)
    n_blocks = math.ceil(N / L)
    starts = N - L + 1
    ba, bb = [], []
    sa_ = np.empty(N)
    sb_ = np.empty(N)
    for _ in range(replicates):
        pos = 0
        for _k in range(n_blocks):
            st = rng.int(starts)
            ln = min(L, N - pos)
            if ln <= 0:
                continue
            sa_[pos:pos + ln] = slope_a * t[pos:pos + ln] + ea[st:st + ln]
            sb_[pos:pos + ln] = slope_b * t[pos:pos + ln] + eb[st:st + ln]
            pos += ln
        ba.append(sen_slope(t, sa_))
        bb.append(sen_slope(t, sb_))
    rho = _pearson_loop(ba, bb)
    se = math.sqrt(max(0.0, se_a ** 2 + se_b ** 2 - 2 * rho * se_a * se_b))
    z = d / se if se > 0 else math.nan
    p = float(2 * stats.norm.sf(abs(z)))
    diff = list(ya - yb)
    x = ar1_mk(diff, alpha)
    xlo, xhi = sen_interval(t, diff, x["correction"])
    return {
        "frequency": freq, "start": s, "end": e,
        "n": {"a": ga["n"], "b": gb["n"], "common": common},
        "slope_a": slope_a, "slope_b": slope_b, "lower_a": lo_a, "upper_a": hi_a, "lower_b": lo_b, "upper_b": hi_b,
        "difference": d, "lower": d - z95 * se, "upper": d + z95 * se, "se": se,
        "z": z, "p": p, "significant": p < alpha, "rho": rho, "block_length": L, "r": r,
        "cross": {"p": x["p"], "z": x["z"], "s": x["s"], "slope": sen_slope(t, diff), "lower": xlo, "upper": xhi},
    }


# ---------------------------------------------------------------------------
# D4 Correlation

def effective_n(n, r1x, r1y):
    prod = r1x * r1y
    return min(n, max(3.0, n * (1 - prod) / (1 + prod)))


def corr_p(r, n):
    if not math.isfinite(r) or not n > 2:
        return math.nan
    if abs(r) >= 1:
        return 0.0
    df = n - 2
    tt = r * math.sqrt(df / (1 - r * r))
    return min(1.0, float(2 * stats.t.sf(abs(tt), df)))


def _corr_block(gx, gy, r1x, r1y, lag=0):
    xs, ys = [], []
    for i in range(len(gy) - lag):
        if math.isfinite(gx[i]) and math.isfinite(gy[i + lag]):
            xs.append(gx[i])
            ys.append(gy[i + lag])
    n = len(xs)
    ne = effective_n(n, r1x, r1y)
    pr = float(stats.pearsonr(xs, ys).statistic)
    sr = float(stats.spearmanr(xs, ys).statistic)
    return {"n": n, "n_eff": ne, "r1x": r1x, "r1y": r1y,
            "pearson": {"r": pr, "p": corr_p(pr, ne), "p_naive": corr_p(pr, n)},
            "spearman": {"r": sr, "p": corr_p(sr, ne), "p_naive": corr_p(sr, n)}}


def correlate(x, y, start=None, end=None, max_lag=0):
    freq, a, b, s, e = align_pair(x, y, start, end)
    gx, gy = grid_series(a, s, e), grid_series(b, s, e)
    xs, ys = [], []
    for u, v in zip(gx["y"], gy["y"]):
        ok = math.isfinite(u) and math.isfinite(v)
        xs.append(u if ok else math.nan)
        ys.append(v if ok else math.nan)
    raw = _corr_block(xs, ys, lag1(xs)["r"], lag1(ys)["r"])
    dx = time_residuals(gx["t"], xs)
    dy = time_residuals(gx["t"], ys)
    r1x, r1y = lag1(dx)["r"], lag1(dy)["r"]
    det = _corr_block(dx, dy, r1x, r1y)
    lags = []
    if max_lag > 0:
        for k in range(max_lag + 1):
            blk = _corr_block(dx, dy, r1x, r1y, k)
            if blk["n"] < 8:
                break
            blk["lag"] = k
            blk["pearson_p_adj"] = min(1.0, blk["pearson"]["p"] * (max_lag + 1))
            blk["spearman_p_adj"] = min(1.0, blk["spearman"]["p"] * (max_lag + 1))
            lags.append(blk)
    return {"frequency": freq, "start": s, "end": e, "raw": raw, "detrended": det, "lags": lags}


# ---------------------------------------------------------------------------
# D5 Sensitivity: OLS with Newey-West (HAC) errors

def newey_west_lags(n):
    return math.floor(4 * (n / 100) ** (2 / 9))


def ols_hac(x, y, alpha=0.05, maxlags=None):
    """Gap-aware OLS + Newey-West, written out in numpy (lags by real time position)."""
    x = np.asarray(x, float)
    y = np.asarray(y, float)
    ok = np.isfinite(x) & np.isfinite(y)
    n = int(ok.sum())
    xv, yv = x[ok], y[ok]
    mx, my = xv.mean(), yv.mean()
    sxx = float(np.sum((xv - mx) ** 2))
    slope = float(np.sum((xv - mx) * (yv - my)) / sxx)
    intercept = float(my - slope * mx)
    u = np.where(ok, y - intercept - slope * x, np.nan)
    L = newey_west_lags(n) if maxlags is None else maxlags
    h = np.where(ok, (x - mx) * u, np.nan)
    meat = float(np.nansum(h * h))
    for lag in range(1, L + 1):
        w = 1 - lag / (L + 1)
        prod = h[lag:] * h[:-lag]
        meat += 2 * w * float(np.nansum(prod))
    var = meat / sxx ** 2 * n / (n - 2)
    se = math.sqrt(var)
    df = n - 2
    tt = slope / se
    p = float(2 * stats.t.sf(abs(tt), df))
    q = float(stats.t.ppf(0.975, df))
    ssr = float(np.nansum(u * u))
    syy = float(np.sum((yv - my) ** 2))
    return {"slope": slope, "intercept": intercept, "se": se, "t": tt, "df": df, "p": p,
            "lower": slope - q * se, "upper": slope + q * se, "r2": 1 - ssr / syy, "n": n, "maxlags": L,
            "contiguous": bool(ok.any() and np.all(ok[np.argmax(ok):len(ok) - np.argmax(ok[::-1])]))}


def ols_hac_statsmodels(x, y, maxlags):
    """statsmodels cross-check (valid rows must be contiguous)."""
    import statsmodels.api as sm
    x = np.asarray(x, float)
    y = np.asarray(y, float)
    ok = np.isfinite(x) & np.isfinite(y)
    res = sm.OLS(y[ok], sm.add_constant(x[ok])).fit(
        cov_type="HAC", cov_kwds={"maxlags": maxlags, "use_correction": True}, use_t=True)
    return {"slope": float(res.params[1]), "se": float(res.bse[1]), "p": float(res.pvalues[1])}


def sensitivity(response, driver, start=None, end=None, lag=0):
    freq, a, b, s, e = align_pair(response, driver, start, end)
    gy, gx = grid_series(a, s, e), grid_series(b, s, e)

    def shift(v):
        return [v[i - lag] if i - lag >= 0 else math.nan for i in range(len(v))]

    levels = ols_hac(shift(gx["y"]), gy["y"])
    det = ols_hac(shift(time_residuals(gx["t"], gx["y"])), time_residuals(gy["t"], gy["y"]))
    for fit, (xx, yy) in ((levels, (shift(gx["y"]), gy["y"])),
                          (det, (shift(time_residuals(gx["t"], gx["y"])), time_residuals(gy["t"], gy["y"])))):
        if fit["contiguous"]:
            ref = ols_hac_statsmodels(xx, yy, fit["maxlags"])
            for k in ("slope", "se", "p"):
                if not math.isclose(ref[k], fit[k], rel_tol=1e-9, abs_tol=1e-12):
                    raise AssertionError(f"numpy HAC disagrees with statsmodels on {k}: {fit[k]} vs {ref[k]}")
    return {"frequency": freq, "start": s, "end": e, "levels": levels, "detrended": det}


# ---------------------------------------------------------------------------
# D6 Monte Carlo propagation of source 1-sigma

def _range_bounds(s, start=None, end=None):
    ds = sorted(d for d in s["dates"] if (start is None or d >= start) and (end is None or d <= end))
    return ds[0], ds[-1]


def uncertainty(series, start=None, end=None, draws=2000, seed=20261113):
    s0, e0 = _range_bounds(series, start, end)
    g = grid_series(series, s0, e0)
    slope, lo, hi, _ = headline(g)
    N = len(g["y"])
    sig = [0.0] * N
    missing = 0
    for i in range(N):
        if not math.isfinite(g["y"][i]):
            continue
        if math.isfinite(g["sigma"][i]) and g["sigma"][i] >= 0:
            sig[i] = g["sigma"][i]
        else:
            missing += 1
    rng = Rng(seed)
    t = g["t"]
    ind, cor = [], []
    for _ in range(draws):
        buf = [g["y"][i] + sig[i] * rng.normal() if math.isfinite(g["y"][i]) else math.nan for i in range(N)]
        ind.append(sen_slope(t, buf))
    for _ in range(draws):
        z = rng.normal()
        buf = [g["y"][i] + sig[i] * z for i in range(N)]
        cor.append(sen_slope(t, buf))

    def combine(v):
        q = np.quantile(np.array(v), [0.025, 0.5, 0.975])
        return {"lower": slope - math.hypot(slope - lo, q[1] - q[0]),
                "upper": slope + math.hypot(hi - slope, q[2] - q[1]),
                "mc_lower": float(q[0]), "mc_median": float(q[1]), "mc_upper": float(q[2])}

    ci, cc = combine(ind), combine(cor)
    pick = "correlated" if (cc["upper"] - cc["lower"]) > (ci["upper"] - ci["lower"]) else "independent"
    ch = cc if pick == "correlated" else ci
    return {"start": s0, "end": e0, "slope": slope, "lower": lo, "upper": hi, "sigma_missing": missing,
            "independent": ci, "correlated": cc, "model": pick,
            "widening": (ch["upper"] - ch["lower"]) / (hi - lo) - 1}


# ---------------------------------------------------------------------------
# D7 Years of data needed

def detectability(series, start=None, end=None, power=0.8, alpha=0.05):
    s0, e0 = _range_bounds(series, start, end)
    g = grid_series(series, s0, e0)
    k = 12 if series["frequency"] == "monthly" else 1
    est = lag1(index_residuals(g["y"]))
    phi, sd = est["r"], est["sd"]
    slope = sen_slope(g["t"], g["y"])
    z_sum = float(stats.norm.ppf(1 - alpha / 2) + stats.norm.ppf(power))
    sy, sm_ = _parse(s0)
    ey, em = _parse(e0)
    years_now = ((ey - sy) * 12 + (em - sm_) + 1) / 12 if k == 12 else ey - sy + 1
    needed = more = None
    if math.isfinite(slope) and slope != 0 and math.isfinite(sd):
        base = z_sum * sd * math.sqrt(12 / k) / abs(slope) * math.sqrt((1 + phi) / (1 - phi))
        needed = base ** (2 / 3)
        more = max(0, math.ceil(needed - years_now))
    test = ar1_mk(g["y"], alpha)
    return {"significant": test["significant"], "slope": slope, "sigma_n": sd, "phi": phi, "z_sum": z_sum,
            "years_now": years_now, "years_needed": needed, "more_years": more}
