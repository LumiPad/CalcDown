/**
 * Purpose: Implement deterministic string helpers for std.text.
 * Intent: Support scalar and vector text composition with strict input validation.
 */

import { makeModule, textPartToString } from "./std_shared.js";

export function createTextModule(): Readonly<Record<string, unknown>> {
  return makeModule({
    concat(...parts: unknown[]): unknown {
      let len: number | null = null;
      for (const p of parts) {
        if (!Array.isArray(p)) continue;
        len = len ?? p.length;
        if (len !== p.length) throw new Error("concat: array length mismatch");
      }

      if (len === null) {
        let out = "";
        for (const p of parts) out += textPartToString(p, "concat");
        return out;
      }

      const out = new Array<string>(len);
      for (let i = 0; i < len; i++) {
        let s = "";
        for (const p of parts) {
          const v = Array.isArray(p) ? p[i] : p;
          s += textPartToString(v, `concat [index ${i}]`);
        }
        out[i] = s;
      }
      return out;
    },
    repeat(value: unknown, count: number): unknown {
      if (!Number.isFinite(count) || !Number.isInteger(count) || count < 0) {
        throw new Error("repeat: count must be a non-negative integer");
      }

      if (typeof value === "string") return value.repeat(count);
      if (!Array.isArray(value)) throw new Error("repeat: expected string or string array");

      const out = new Array<string>(value.length);
      for (let i = 0; i < value.length; i++) {
        const v = value[i];
        if (typeof v !== "string") throw new Error("repeat: expected string array");
        out[i] = v.repeat(count);
      }
      return out;
    },
  });
}
