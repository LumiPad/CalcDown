/**
 * Purpose: Provide array utilities for CalcDown models.
 * Intent: Keep transformations deterministic and avoid mutation.
 */

import { assertSafeKey, makeModule } from "./std_shared.js";

function assertArray(items: unknown, fn: string): unknown[] {
  if (!Array.isArray(items)) throw new Error(`${fn}: expected array`);
  return items;
}

function assertNonNegativeInteger(n: unknown, fn: string): number {
  if (typeof n !== "number" || !Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
    throw new Error(`${fn}: n must be a non-negative integer`);
  }
  return n;
}

function assertInteger(n: unknown, fn: string): number {
  if (typeof n !== "number" || !Number.isFinite(n) || !Number.isInteger(n)) {
    throw new Error(`${fn}: index must be an integer`);
  }
  return n;
}

function scalarKeyOf(v: unknown, fn: string): string {
  if (v === null) return "null";
  if (v === undefined) return "undefined";
  if (typeof v === "string") return `s:${v}`;
  if (typeof v === "boolean") return `b:${v ? "1" : "0"}`;
  if (typeof v === "number") {
    if (!Number.isFinite(v)) throw new Error(`${fn}: expected finite numbers`);
    return `n:${String(v)}`;
  }
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) throw new Error(`${fn}: invalid date`);
    return `d:${String(v.getTime())}`;
  }
  throw new Error(`${fn}: expected comparable scalars`);
}

export function createArrayModule(): Readonly<Record<string, unknown>> {
  return makeModule({
    take(items: unknown, n: unknown): unknown[] {
      const arr = assertArray(items, "take");
      const count = assertNonNegativeInteger(n, "take");
      return arr.slice(0, count);
    },

    drop(items: unknown, n: unknown): unknown[] {
      const arr = assertArray(items, "drop");
      const count = assertNonNegativeInteger(n, "drop");
      return arr.slice(count);
    },

    concat(a: unknown, b: unknown): unknown[] {
      const aa = assertArray(a, "concat");
      const bb = assertArray(b, "concat");
      return aa.concat(bb);
    },

    zip(a: unknown, b: unknown): unknown[] {
      const aa = assertArray(a, "zip");
      const bb = assertArray(b, "zip");
      if (aa.length !== bb.length) throw new Error("zip: array length mismatch");
      const out = new Array<unknown>(aa.length);
      for (let i = 0; i < aa.length; i++) out[i] = [aa[i], bb[i]];
      return out;
    },

    flatten(items: unknown): unknown[] {
      const arr = assertArray(items, "flatten");
      const out: unknown[] = [];
      for (const v of arr) {
        if (Array.isArray(v)) out.push(...v);
        else out.push(v);
      }
      return out;
    },

    at(items: unknown, index: unknown): unknown {
      const arr = assertArray(items, "at");
      const i = assertInteger(index, "at");
      const resolved = i < 0 ? arr.length + i : i;
      if (resolved < 0 || resolved >= arr.length) return null;
      return arr[resolved];
    },

    indexOf(items: unknown, needle: unknown): number {
      const arr = assertArray(items, "indexOf");
      const needleKey = scalarKeyOf(needle, "indexOf");
      for (let i = 0; i < arr.length; i++) {
        if (scalarKeyOf(arr[i], "indexOf") === needleKey) return i;
      }
      return -1;
    },

    find(items: unknown, predicate: unknown): unknown {
      const arr = assertArray(items, "find");
      if (typeof predicate !== "function") throw new Error("find: expected predicate function");
      for (const item of arr) {
        const ok = (predicate as (...args: unknown[]) => unknown)(item);
        if (typeof ok !== "boolean") throw new Error("find: predicate must return boolean");
        if (ok) return item;
      }
      return null;
    },

    some(items: unknown, predicate: unknown): boolean {
      const arr = assertArray(items, "some");
      if (typeof predicate !== "function") throw new Error("some: expected predicate function");
      for (const item of arr) {
        const ok = (predicate as (...args: unknown[]) => unknown)(item);
        if (typeof ok !== "boolean") throw new Error("some: predicate must return boolean");
        if (ok) return true;
      }
      return false;
    },

    every(items: unknown, predicate: unknown): boolean {
      const arr = assertArray(items, "every");
      if (typeof predicate !== "function") throw new Error("every: expected predicate function");
      for (const item of arr) {
        const ok = (predicate as (...args: unknown[]) => unknown)(item);
        if (typeof ok !== "boolean") throw new Error("every: predicate must return boolean");
        if (!ok) return false;
      }
      return true;
    },

    distinct(items: unknown): unknown[] {
      const arr = assertArray(items, "distinct");
      const seen = new Set<string>();
      const out: unknown[] = [];
      for (const item of arr) {
        const key = scalarKeyOf(item, "distinct");
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(item);
      }
      return out;
    },

    product(xs: unknown): number {
      const arr = assertArray(xs, "product");
      if (arr.length === 0) throw new Error("product: empty array");
      let out = 1;
      for (const v of arr) {
        if (typeof v !== "number" || !Number.isFinite(v)) throw new Error("product: expected finite number array");
        out *= v;
      }
      if (!Number.isFinite(out)) throw new Error("Non-finite numeric result");
      return out;
    },

    countBy(items: unknown, key: unknown): Record<string, number> {
      const arr = assertArray(items, "countBy");
      if (typeof key !== "string" || !key.trim()) throw new Error("countBy: expected key string");

      const out: Record<string, number> = Object.create(null);
      for (const item of arr) {
        if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("countBy: expected row objects");
        if (!Object.prototype.hasOwnProperty.call(item, key)) throw new Error(`countBy: missing key: ${key}`);
        const raw = (item as Record<string, unknown>)[key];
        const k =
          typeof raw === "string"
            ? raw
            : typeof raw === "number" && Number.isFinite(raw)
              ? String(raw)
              : null;
        if (k === null) throw new Error("countBy: key values must be string or finite number");
        assertSafeKey(k, "countBy");
        out[k] = (out[k] ?? 0) + 1;
      }
      return out;
    },
  });
}

