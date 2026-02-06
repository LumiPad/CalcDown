/**
 * Purpose: Implement keyed lookup primitives for std.lookup.
 * Intent: Provide deterministic index/get/xlookup behavior with explicit failures.
 */

import { assertSafeKey, makeModule, mapKeyOf } from "./std_shared.js";

const LOOKUP_INDEX = Symbol("calcdown.lookup.index");

type LookupIndex = { [LOOKUP_INDEX]: { keyColumn: string; map: Map<string, Record<string, unknown>[]> } };

function asLookupIndex(v: unknown): LookupIndex {
  if (!v || (typeof v !== "object" && typeof v !== "function")) throw new Error("lookup.get: invalid index");
  if (!(LOOKUP_INDEX in (v as object))) throw new Error("lookup.get: invalid index");
  return v as LookupIndex;
}

function makeLookupIndex(keyColumn: string, map: Map<string, Record<string, unknown>[]>): LookupIndex {
  const idx = Object.create(null) as LookupIndex;
  (idx as unknown as Record<symbol, unknown>)[LOOKUP_INDEX] = { keyColumn, map };
  return Object.freeze(idx);
}

export function createLookupModule(): Readonly<Record<string, unknown>> {
  return makeModule({
    index(rows: unknown, keyColumn: string): unknown {
      if (!Array.isArray(rows)) throw new Error("lookup.index: expected rows array");
      if (typeof keyColumn !== "string") throw new Error("lookup.index: keyColumn must be string");
      assertSafeKey(keyColumn, "lookup.index");
      const map = new Map<string, Record<string, unknown>[]>();
      for (const row of rows) {
        if (!row || typeof row !== "object") throw new Error("lookup.index: expected row objects");
        const kv = (row as Record<string, unknown>)[keyColumn];
        const mk = mapKeyOf(kv);
        if (mk === null) throw new Error("lookup.index: key values must be string or finite number");
        const bucket = map.get(mk) ?? [];
        bucket.push(row as Record<string, unknown>);
        map.set(mk, bucket);
      }
      return makeLookupIndex(keyColumn, map);
    },
    get(index: unknown, key: string | number): Record<string, unknown> {
      const idx = asLookupIndex(index);
      const mk = mapKeyOf(key);
      if (mk === null) throw new Error("lookup.get: key must be string or finite number");
      const bucket = idx[LOOKUP_INDEX].map.get(mk);
      if (!bucket || bucket.length === 0) throw new Error("lookup.get: key not found");
      return bucket[0]!;
    },
    xlookup(
      key: string | number,
      rows: unknown,
      keyColumn: string,
      valueColumn: string,
      notFound?: unknown
    ): unknown {
      if (!Array.isArray(rows)) throw new Error("lookup.xlookup: expected rows array");
      if (typeof keyColumn !== "string") throw new Error("lookup.xlookup: keyColumn must be string");
      if (typeof valueColumn !== "string") throw new Error("lookup.xlookup: valueColumn must be string");
      assertSafeKey(keyColumn, "lookup.xlookup");
      assertSafeKey(valueColumn, "lookup.xlookup");

      const mkNeedle = mapKeyOf(key);
      if (mkNeedle === null) throw new Error("lookup.xlookup: key must be string or finite number");

      for (const row of rows) {
        if (!row || typeof row !== "object") throw new Error("lookup.xlookup: expected row objects");
        const kv = (row as Record<string, unknown>)[keyColumn];
        const mk = mapKeyOf(kv);
        if (mk === null) throw new Error("lookup.xlookup: key values must be string or finite number");
        if (mk === mkNeedle) return (row as Record<string, unknown>)[valueColumn];
      }

      if (arguments.length >= 5) return notFound;
      throw new Error("lookup.xlookup: key not found");
    },
  });
}
