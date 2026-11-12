// Seeded random numbers, identical in TypeScript and in the Python reference
// (pipeline/stats/reference_m5.py), so bootstrap and Monte Carlo results can be
// checked exactly. Decision D2.1 in docs/stats/decisions.md.
//
// Generator: xoshiro128** (Blackman and Vigna 2018), state from splitmix32.
// All arithmetic is unsigned 32-bit.

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

export class Rng {
  private s0: number;
  private s1: number;
  private s2: number;
  private s3: number;

  /** `seed` is an integer; it is reduced to 32 bits (like Python's `seed & 0xFFFFFFFF`). */
  constructor(seed: number) {
    let a = seed >>> 0;
    const splitmix32 = (): number => {
      a = (a + 0x9e3779b9) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 16), 0x21f0aaad) >>> 0;
      t = Math.imul(t ^ (t >>> 15), 0x735a2d97) >>> 0;
      return (t ^ (t >>> 15)) >>> 0;
    };
    this.s0 = splitmix32();
    this.s1 = splitmix32();
    this.s2 = splitmix32();
    this.s3 = splitmix32();
    if ((this.s0 | this.s1 | this.s2 | this.s3) === 0) this.s0 = 1;
  }

  /** Next unsigned 32-bit integer. */
  nextU32(): number {
    const result = Math.imul(rotl(Math.imul(this.s1, 5) >>> 0, 7), 9) >>> 0;
    const t = (this.s1 << 9) >>> 0;
    this.s2 = (this.s2 ^ this.s0) >>> 0;
    this.s3 = (this.s3 ^ this.s1) >>> 0;
    this.s1 = (this.s1 ^ this.s2) >>> 0;
    this.s0 = (this.s0 ^ this.s3) >>> 0;
    this.s2 = (this.s2 ^ t) >>> 0;
    this.s3 = rotl(this.s3, 11);
    return result;
  }

  /** Uniform in [0, 1), exactly u32 / 2^32. */
  uniform(): number {
    return this.nextU32() / 4294967296;
  }

  /** Integer in [0, k). */
  int(k: number): number {
    return Math.floor(this.uniform() * k);
  }

  /** Standard normal by Box-Muller (two fresh uniforms, no caching). */
  normal(): number {
    const u1 = this.uniform();
    const u2 = this.uniform();
    return Math.sqrt(-2 * Math.log(1 - u1)) * Math.cos(2 * Math.PI * u2);
  }
}
