/**
 * Purpose: Provide statistical helpers for CalcDown models.
 * Intent: Keep numeric behavior deterministic and reject invalid inputs early.
 */

import { makeModule } from "./std_shared.js";

const EPS = 1e-12;

function assertNumberArray(xs: unknown, fn: string, minLen: number): number[] {
  if (!Array.isArray(xs)) throw new Error(`${fn}: expected array`);
  if (xs.length < minLen) throw new Error(`${fn}: expected at least ${minLen} values`);
  const out = new Array<number>(xs.length);
  for (let i = 0; i < xs.length; i++) {
    const v = xs[i];
    if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`${fn}: expected finite number array`);
    out[i] = v;
  }
  return out;
}

function assertSameLength(xs: unknown, ys: unknown, fn: string, minLen: number): { xs: number[]; ys: number[] } {
  const a = assertNumberArray(xs, fn, minLen);
  const b = assertNumberArray(ys, fn, minLen);
  if (a.length !== b.length) throw new Error(`${fn}: array length mismatch`);
  return { xs: a, ys: b };
}

function mean(xs: number[]): number {
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

function sorted(xs: number[]): number[] {
  const ys = xs.slice();
  ys.sort((a, b) => a - b);
  return ys;
}

function varianceSample(xs: number[]): number {
  const mu = mean(xs);
  let sumSq = 0;
  for (const x of xs) {
    const d = x - mu;
    sumSq += d * d;
  }
  return sumSq / (xs.length - 1);
}

export function createStatsModule(): Readonly<Record<string, unknown>> {
  const variance = (xs: unknown): number => {
    const arr = assertNumberArray(xs, "variance", 2);
    const v = varianceSample(arr);
    if (!Number.isFinite(v)) throw new Error("Non-finite numeric result");
    return v;
  };

  const percentile = (xs: unknown, p: unknown): number => {
    const arr = assertNumberArray(xs, "percentile", 1);
    if (typeof p !== "number" || !Number.isFinite(p) || p < 0 || p > 100) {
      throw new Error("percentile: p must be a finite number in [0, 100]");
    }
    const ys = sorted(arr);
    const n = ys.length;
    if (n === 1) return ys[0]!;

    const rank = (p / 100) * (n - 1);
    const lo = Math.floor(rank);
    const hi = Math.ceil(rank);
    if (lo === hi) return ys[lo]!;

    const a = ys[lo]!;
    const b = ys[hi]!;
    const t = rank - lo;
    const out = a + t * (b - a);
    if (!Number.isFinite(out)) throw new Error("Non-finite numeric result");
    return out;
  };

  const covariance = (xs: unknown, ys: unknown): number => {
    const both = assertSameLength(xs, ys, "covariance", 2);
    const mx = mean(both.xs);
    const my = mean(both.ys);
    let s = 0;
    for (let i = 0; i < both.xs.length; i++) {
      s += (both.xs[i]! - mx) * (both.ys[i]! - my);
    }
    const out = s / (both.xs.length - 1);
    if (!Number.isFinite(out)) throw new Error("Non-finite numeric result");
    return out;
  };

  return makeModule({
    median(xs: unknown): number {
      const arr = assertNumberArray(xs, "median", 1);
      const ys = sorted(arr);
      const n = ys.length;
      const mid = Math.floor(n / 2);
      if (n % 2 === 1) return ys[mid]!;
      return (ys[mid - 1]! + ys[mid]!) / 2;
    },

    variance,

    stdev(xs: unknown): number {
      const v = variance(xs);
      return Math.sqrt(v);
    },

    percentile(xs: unknown, p: unknown): number {
      return percentile(xs, p);
    },

    quartiles(xs: unknown): [number, number, number] {
      const q1 = percentile(xs, 25);
      const q2 = percentile(xs, 50);
      const q3 = percentile(xs, 75);
      return [q1, q2, q3];
    },

    covariance,

    correlation(xs: unknown, ys: unknown): number {
      const both = assertSameLength(xs, ys, "correlation", 2);
      const vx = varianceSample(both.xs);
      const vy = varianceSample(both.ys);
      if (vx <= EPS || vy <= EPS) throw new Error("correlation: undefined (zero variance)");
      const cov = covariance(both.xs, both.ys);
      const out = cov / (Math.sqrt(vx) * Math.sqrt(vy));
      return out;
    },

    linearFit(xs: unknown, ys: unknown): { slope: number; intercept: number; r2: number } {
      const both = assertSameLength(xs, ys, "linearFit", 2);
      const mx = mean(both.xs);
      const my = mean(both.ys);
      const vx = varianceSample(both.xs);
      if (vx <= EPS) throw new Error("linearFit: xs has zero variance");
      const cov = covariance(both.xs, both.ys);
      const slope = cov / vx;
      const intercept = my - slope * mx;
      if (!Number.isFinite(slope) || !Number.isFinite(intercept)) throw new Error("Non-finite numeric result");

      let sst = 0;
      let sse = 0;
      for (let i = 0; i < both.xs.length; i++) {
        const x = both.xs[i]!;
        const y = both.ys[i]!;
        const yhat = intercept + slope * x;
        const dy = y - my;
        const err = y - yhat;
        sst += dy * dy;
        sse += err * err;
      }

      let r2: number;
      if (sst <= EPS) {
        r2 = sse <= EPS ? 1 : 0;
      } else {
        r2 = 1 - sse / sst;
      }

      if (!Number.isFinite(r2)) throw new Error("Non-finite numeric result");
      return Object.assign(Object.create(null), { slope, intercept, r2 });
    },

    predict(fit: unknown, x: unknown): number {
      if (!fit || typeof fit !== "object") throw new Error("predict: expected fit object");
      const slope = (fit as any).slope;
      const intercept = (fit as any).intercept;
      if (typeof slope !== "number" || !Number.isFinite(slope)) throw new Error("predict: slope must be finite");
      if (typeof intercept !== "number" || !Number.isFinite(intercept)) throw new Error("predict: intercept must be finite");
      if (typeof x !== "number" || !Number.isFinite(x)) throw new Error("predict: x must be finite");

      const y = intercept + slope * x;
      if (!Number.isFinite(y)) throw new Error("Non-finite numeric result");
      return y;
    },
  });
}
