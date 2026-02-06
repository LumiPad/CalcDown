/**
 * Purpose: Implement spreadsheet-style numeric functions for std.math.
 * Intent: Keep numeric behavior deterministic and reject non-finite values early.
 */

import { makeModule } from "./std_shared.js";

export function createMathModule(): Readonly<Record<string, unknown>> {
  return makeModule({
    sum(xs: unknown): number {
      if (!Array.isArray(xs)) throw new Error("sum: expected array");
      let s = 0;
      for (const v of xs) {
        if (typeof v !== "number" || !Number.isFinite(v)) throw new Error("sum: expected finite number array");
        s += v;
      }
      return s;
    },
    mean(xs: unknown): number {
      if (!Array.isArray(xs)) throw new Error("mean: expected array");
      if (xs.length === 0) throw new Error("mean: empty array");
      let s = 0;
      for (const v of xs) {
        if (typeof v !== "number" || !Number.isFinite(v)) throw new Error("mean: expected finite number array");
        s += v;
      }
      return s / xs.length;
    },
    minOf(xs: unknown): number {
      if (!Array.isArray(xs)) throw new Error("minOf: expected array");
      if (xs.length === 0) throw new Error("minOf: empty array");
      let min: number | null = null;
      for (const v of xs) {
        if (typeof v !== "number" || !Number.isFinite(v)) throw new Error("minOf: expected finite number array");
        min = min === null ? v : Math.min(min, v);
      }
      return min ?? 0;
    },
    maxOf(xs: unknown): number {
      if (!Array.isArray(xs)) throw new Error("maxOf: expected array");
      if (xs.length === 0) throw new Error("maxOf: empty array");
      let max: number | null = null;
      for (const v of xs) {
        if (typeof v !== "number" || !Number.isFinite(v)) throw new Error("maxOf: expected finite number array");
        max = max === null ? v : Math.max(max, v);
      }
      return max ?? 0;
    },
    round(x: number, digits = 0): number {
      if (typeof x !== "number" || !Number.isFinite(x)) throw new Error("round: x must be finite");
      if (typeof digits !== "number" || !Number.isFinite(digits) || !Number.isInteger(digits)) {
        throw new Error("round: digits must be integer");
      }

      const roundHalfAwayFromZero = (n: number): number => (n < 0 ? -Math.round(-n) : Math.round(n));

      if (digits === 0) return roundHalfAwayFromZero(x);

      const abs = Math.abs(digits);
      if (abs > 12) throw new Error("round: digits out of range");
      const factor = 10 ** abs;
      if (!Number.isFinite(factor) || factor === 0) throw new Error("round: digits out of range");

      if (digits > 0) return roundHalfAwayFromZero(x * factor) / factor;
      return roundHalfAwayFromZero(x / factor) * factor;
    },
    abs(x: number): number {
      if (typeof x !== "number" || !Number.isFinite(x)) throw new Error("abs: x must be finite");
      return Math.abs(x);
    },
    sign(x: number): number {
      if (typeof x !== "number" || !Number.isFinite(x)) throw new Error("sign: x must be finite");
      const s = Math.sign(x);
      return Object.is(s, -0) ? 0 : s;
    },
    sqrt(x: number): number {
      if (typeof x !== "number" || !Number.isFinite(x)) throw new Error("sqrt: x must be finite");
      const y = Math.sqrt(x);
      if (!Number.isFinite(y)) throw new Error("Non-finite numeric result");
      return y;
    },
    exp(x: number): number {
      if (typeof x !== "number" || !Number.isFinite(x)) throw new Error("exp: x must be finite");
      const y = Math.exp(x);
      if (!Number.isFinite(y)) throw new Error("Non-finite numeric result");
      return y;
    },
    ln(x: number): number {
      if (typeof x !== "number" || !Number.isFinite(x)) throw new Error("ln: x must be finite");
      const y = Math.log(x);
      if (!Number.isFinite(y)) throw new Error("Non-finite numeric result");
      return y;
    },
    log10(x: number): number {
      if (typeof x !== "number" || !Number.isFinite(x)) throw new Error("log10: x must be finite");
      const y = Math.log(x) / Math.LN10;
      if (!Number.isFinite(y)) throw new Error("Non-finite numeric result");
      return y;
    },
    sin(x: number): number {
      if (typeof x !== "number" || !Number.isFinite(x)) throw new Error("sin: x must be finite");
      const y = Math.sin(x);
      if (!Number.isFinite(y)) throw new Error("Non-finite numeric result");
      return y;
    },
    cos(x: number): number {
      if (typeof x !== "number" || !Number.isFinite(x)) throw new Error("cos: x must be finite");
      const y = Math.cos(x);
      if (!Number.isFinite(y)) throw new Error("Non-finite numeric result");
      return y;
    },
    tan(x: number): number {
      if (typeof x !== "number" || !Number.isFinite(x)) throw new Error("tan: x must be finite");
      const y = Math.tan(x);
      if (!Number.isFinite(y)) throw new Error("Non-finite numeric result");
      return y;
    },
    asin(x: number): number {
      if (typeof x !== "number" || !Number.isFinite(x)) throw new Error("asin: x must be finite");
      const y = Math.asin(x);
      if (!Number.isFinite(y)) throw new Error("Non-finite numeric result");
      return y;
    },
    acos(x: number): number {
      if (typeof x !== "number" || !Number.isFinite(x)) throw new Error("acos: x must be finite");
      const y = Math.acos(x);
      if (!Number.isFinite(y)) throw new Error("Non-finite numeric result");
      return y;
    },
    atan(x: number): number {
      if (typeof x !== "number" || !Number.isFinite(x)) throw new Error("atan: x must be finite");
      const y = Math.atan(x);
      if (!Number.isFinite(y)) throw new Error("Non-finite numeric result");
      return y;
    },
    atan2(y: number, x: number): number {
      if (typeof y !== "number" || !Number.isFinite(y)) throw new Error("atan2: y must be finite");
      if (typeof x !== "number" || !Number.isFinite(x)) throw new Error("atan2: x must be finite");
      const out = Math.atan2(y, x);
      if (!Number.isFinite(out)) throw new Error("Non-finite numeric result");
      return out;
    },
    sinh(x: number): number {
      if (typeof x !== "number" || !Number.isFinite(x)) throw new Error("sinh: x must be finite");
      const y = Math.sinh(x);
      if (!Number.isFinite(y)) throw new Error("Non-finite numeric result");
      return y;
    },
    cosh(x: number): number {
      if (typeof x !== "number" || !Number.isFinite(x)) throw new Error("cosh: x must be finite");
      const y = Math.cosh(x);
      if (!Number.isFinite(y)) throw new Error("Non-finite numeric result");
      return y;
    },
    tanh(x: number): number {
      if (typeof x !== "number" || !Number.isFinite(x)) throw new Error("tanh: x must be finite");
      const y = Math.tanh(x);
      if (!Number.isFinite(y)) throw new Error("Non-finite numeric result");
      return y;
    },
    ceil(x: number): number {
      if (typeof x !== "number" || !Number.isFinite(x)) throw new Error("ceil: x must be finite");
      const y = Math.ceil(x);
      if (!Number.isFinite(y)) throw new Error("Non-finite numeric result");
      return y;
    },
    floor(x: number): number {
      if (typeof x !== "number" || !Number.isFinite(x)) throw new Error("floor: x must be finite");
      const y = Math.floor(x);
      if (!Number.isFinite(y)) throw new Error("Non-finite numeric result");
      return y;
    },
    trunc(x: number): number {
      if (typeof x !== "number" || !Number.isFinite(x)) throw new Error("trunc: x must be finite");
      const y = Math.trunc(x);
      if (!Number.isFinite(y)) throw new Error("Non-finite numeric result");
      return y;
    },
    pow(base: number, exp: number): number {
      if (typeof base !== "number" || !Number.isFinite(base)) throw new Error("pow: base must be finite");
      if (typeof exp !== "number" || !Number.isFinite(exp)) throw new Error("pow: exp must be finite");
      const y = base ** exp;
      if (!Number.isFinite(y)) throw new Error("Non-finite numeric result");
      return y;
    },
    E: Math.E,
    PI: Math.PI,
  });
}
