// Normal distribution functions with no dependencies.
// Accuracy is about 1e-15, enough to match scipy to well under 1e-9.

const SQRT_PI = Math.sqrt(Math.PI);

/** Complementary error function erfc(x) = 1 - erf(x). */
export function erfc(x: number): number {
  if (Number.isNaN(x)) return NaN;
  if (x < 0) return 2 - erfc(-x);
  if (x < 3) return 1 - erfSeries(x);
  return erfcContinuedFraction(x);
}

/** erf(x) for 0 <= x < 3, by the all-positive series (numerically stable). */
function erfSeries(x: number): number {
  // erf(x) = 2/sqrt(pi) * exp(-x^2) * sum_{n>=0} 2^n x^(2n+1) / (1*3*5*...*(2n+1))
  const x2 = x * x;
  let term = x;
  let sum = x;
  for (let n = 1; n < 200; n++) {
    term *= (2 * x2) / (2 * n + 1);
    sum += term;
    if (term < sum * 1e-17) break;
  }
  return (2 / SQRT_PI) * Math.exp(-x2) * sum;
}

/** erfc(x) for x >= 3, by a continued fraction (modified Lentz). */
function erfcContinuedFraction(x: number): number {
  // erfc(x) = exp(-x^2)/sqrt(pi) * 1/(x + (1/2)/(x + 1/(x + (3/2)/(x + 2/(x + ...)))))
  const tiny = 1e-300;
  let f = x;
  let c = x;
  let d = 0;
  for (let k = 1; k < 500; k++) {
    const a = k / 2;
    d = x + a * d;
    if (d === 0) d = tiny;
    c = x + a / c;
    if (c === 0) c = tiny;
    d = 1 / d;
    const delta = c * d;
    f *= delta;
    if (Math.abs(delta - 1) < 1e-16) break;
  }
  return Math.exp(-x * x) / (SQRT_PI * f);
}

/** Standard normal cumulative distribution function. */
export function normCdf(z: number): number {
  return 0.5 * erfc(-z / Math.SQRT2);
}

/** Standard normal upper tail, P(Z > z). Keeps precision for large z. */
export function normSf(z: number): number {
  return 0.5 * erfc(z / Math.SQRT2);
}

/** Standard normal quantile (inverse CDF). */
export function normPpf(p: number): number {
  if (Number.isNaN(p) || p < 0 || p > 1) return NaN;
  if (p === 0) return -Infinity;
  if (p === 1) return Infinity;

  // Acklam's rational approximation, then two Halley refinement steps.
  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
    1.38357751867269e2, -3.066479806614716e1, 2.506628277459239,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
    -2.549732539343734, 4.374664141464968, 2.938163982698783,
  ];
  const d = [
    7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996,
    3.754408661907416,
  ];
  const pLow = 0.02425;
  let x: number;
  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p));
    x =
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= 1 - pLow) {
    const q = p - 0.5;
    const r = q * q;
    x =
      ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    x =
      -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  for (let i = 0; i < 2; i++) {
    const e = p < 0.5 ? normCdf(x) - p : -(normSf(x) - (1 - p));
    const u = e * Math.sqrt(2 * Math.PI) * Math.exp((x * x) / 2);
    x = x - u / (1 + (x * u) / 2);
  }
  return x;
}

// ---------------------------------------------------------------------------
// Student t distribution (for correlation and HAC regression p-values, M5).

const LANCZOS_G = 7;
const LANCZOS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
  1.5056327351493116e-7,
];

/** Natural log of the gamma function for x > 0 (Lanczos, g = 7). */
export function lgamma(x: number): number {
  if (!(x > 0)) return NaN;
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
  const xx = x - 1;
  let a = LANCZOS[0];
  const t = xx + LANCZOS_G + 0.5;
  for (let i = 1; i < 9; i++) a += LANCZOS[i] / (xx + i);
  return 0.5 * Math.log(2 * Math.PI) + (xx + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Continued fraction for the incomplete beta function (modified Lentz). */
function betacf(a: number, b: number, x: number): number {
  const tiny = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < tiny) d = tiny;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 10000; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-16) break;
  }
  return h;
}

/** Regularized incomplete beta function I_x(a, b). */
export function betaincReg(a: number, b: number, x: number): number {
  if (Number.isNaN(x) || x < 0 || x > 1) return NaN;
  if (x === 0) return 0;
  if (x === 1) return 1;
  const lbt = lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log1p(-x);
  if (x < (a + 1) / (a + b + 2)) return (Math.exp(lbt) * betacf(a, b, x)) / a;
  return 1 - (Math.exp(lbt) * betacf(b, a, 1 - x)) / b;
}

/** Upper tail P(T > t) of Student's t with `df` (> 0, may be fractional) degrees of freedom. */
export function studentTSf(t: number, df: number): number {
  if (Number.isNaN(t) || !(df > 0)) return NaN;
  if (t === Infinity) return 0;
  if (t === -Infinity) return 1;
  // P(|T| > |t|) = I_{df/(df+t^2)}(df/2, 1/2); compute the small tail directly.
  const x = df / (df + t * t);
  const tail = 0.5 * betaincReg(df / 2, 0.5, x);
  return t > 0 ? tail : 1 - tail;
}

/** Two-sided p-value for a t statistic. */
export function studentTTwoSided(t: number, df: number): number {
  if (Number.isNaN(t) || !(df > 0)) return NaN;
  const x = df / (df + t * t);
  return Math.min(1, betaincReg(df / 2, 0.5, x));
}

/** Student t quantile (inverse CDF), by bisection refined with Newton steps. */
export function studentTPpf(p: number, df: number): number {
  if (Number.isNaN(p) || p < 0 || p > 1 || !(df > 0)) return NaN;
  if (p === 0) return -Infinity;
  if (p === 1) return Infinity;
  if (p === 0.5) return 0;
  if (p < 0.5) return -studentTPpf(1 - p, df);
  // p > 0.5: solve sf(t) = 1 - p for t > 0.
  const q = 1 - p;
  let lo = 0;
  let hi = 1;
  while (studentTSf(hi, df) > q) hi *= 2;
  for (let i = 0; i < 200 && hi - lo > 1e-15 * hi; i++) {
    const mid = 0.5 * (lo + hi);
    if (studentTSf(mid, df) > q) lo = mid;
    else hi = mid;
  }
  let t = 0.5 * (lo + hi);
  const logC = lgamma((df + 1) / 2) - lgamma(df / 2) - 0.5 * Math.log(df * Math.PI);
  for (let i = 0; i < 3; i++) {
    const pdf = Math.exp(logC - ((df + 1) / 2) * Math.log1p((t * t) / df));
    const step = (studentTSf(t, df) - q) / pdf;
    if (!Number.isFinite(step)) break;
    t += step;
  }
  return t;
}
