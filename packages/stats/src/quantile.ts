/** Type-7 quantile of a sorted array (numpy.quantile default, linear interpolation). */
export function quantileSorted(s: ArrayLike<number>, q: number): number {
  const n = s.length;
  if (n === 0) return NaN;
  const h = (n - 1) * q;
  const lo = Math.floor(h);
  const hi = Math.min(lo + 1, n - 1);
  return s[lo] + (h - lo) * (s[hi] - s[lo]);
}
