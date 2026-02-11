/**
 * Purpose: Provide percent helpers for converting ratios into percent points.
 * Intent: Reduce ambiguity between 0..1 ratios and 0..100 percent-point conventions in models.
 */

import { makeModule } from "./std_shared.js";

function broadcastLen(fn: string, parts: unknown[]): number | null {
  let len: number | null = null;
  for (const p of parts) {
    if (!Array.isArray(p)) continue;
    len = len ?? p.length;
    if (len !== p.length) throw new Error(`${fn}: array length mismatch`);
  }
  return len;
}

function broadcastAt(part: unknown, index: number): unknown {
  return Array.isArray(part) ? part[index] : part;
}

function assertFiniteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(label);
  return value;
}

export function createPercentModule(): Readonly<Record<string, unknown>> {
  return makeModule({
    of(part: unknown, whole: unknown): unknown {
      const len = broadcastLen("percent.of", [part, whole]);
      if (len === null) {
        const p = assertFiniteNumber(part, "percent.of: part must be finite");
        const w = assertFiniteNumber(whole, "percent.of: whole must be finite");
        if (w === 0) throw new Error("percent.of: whole must be non-zero");
        const out = (p / w) * 100;
        if (!Number.isFinite(out)) throw new Error("percent.of: non-finite result");
        return out;
      }

      const out = new Array<number>(len);
      for (let i = 0; i < len; i++) {
        const p = assertFiniteNumber(broadcastAt(part, i), "percent.of: part must be finite");
        const w = assertFiniteNumber(broadcastAt(whole, i), "percent.of: whole must be finite");
        if (w === 0) throw new Error(`percent.of [index ${i}]: whole must be non-zero`);
        const v = (p / w) * 100;
        if (!Number.isFinite(v)) throw new Error(`percent.of [index ${i}]: non-finite result`);
        out[i] = v;
      }
      return out;
    },
  });
}

