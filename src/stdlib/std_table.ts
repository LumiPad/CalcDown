/**
 * Purpose: Implement relational helpers for std.table row-array workflows.
 * Intent: Provide deterministic grouping, aggregation, joining, and projections.
 */

import type { DataSortByFn } from "./std_data.js";
import { assertSafeKey, makeModule, mapKeyOf } from "./std_shared.js";

export function createTableModule(sortByData: DataSortByFn): Readonly<Record<string, unknown>> {
  function col<T = unknown>(rows: unknown, key: string): T[] {
    if (!Array.isArray(rows)) throw new Error("col: expected rows array");
    assertSafeKey(key, "col");
    const out: T[] = [];
    for (const row of rows) {
      if (!row || typeof row !== "object") throw new Error("col: expected row objects");
      const v = Object.prototype.hasOwnProperty.call(row, key) ? (row as Record<string, unknown>)[key] : undefined;
      out.push(v as T);
    }
    return out;
  }

  return makeModule({
    col,
    map<TIn extends Record<string, unknown>, TOut>(rows: unknown, mapper: (row: TIn, index: number) => TOut): TOut[] {
      if (!Array.isArray(rows)) throw new Error("map: expected rows array");
      if (typeof mapper !== "function") throw new Error("map: expected mapper function");
      const out: TOut[] = [];
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!row || typeof row !== "object") throw new Error("map: expected row objects");
        out.push(mapper(row as TIn, i));
      }
      return out;
    },
    sum(rows: unknown, key: string): number {
      const xs = col(rows, key) as unknown[];
      let s = 0;
      for (const v of xs) {
        if (typeof v !== "number" || !Number.isFinite(v)) throw new Error("sum: expected finite numbers");
        s += v;
      }
      return s;
    },
    filter<TIn extends Record<string, unknown>>(rows: unknown, predicate: (row: TIn, index: number) => unknown): TIn[] {
      if (!Array.isArray(rows)) throw new Error("filter: expected rows array");
      if (typeof predicate !== "function") throw new Error("filter: expected predicate function");
      const out: TIn[] = [];
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!row || typeof row !== "object") throw new Error("filter: expected row objects");
        if (predicate(row as TIn, i)) out.push(row as TIn);
      }
      return out;
    },
    sortBy<T extends Record<string, unknown>>(rows: unknown, key: string, direction: "asc" | "desc" = "asc"): T[] {
      return sortByData(rows, key, direction) as T[];
    },
    groupBy<T extends Record<string, unknown>>(
      rows: unknown,
      key: string | ((row: T, index: number) => unknown)
    ): Array<{ key: string | number; rows: T[] }> {
      if (!Array.isArray(rows)) throw new Error("groupBy: expected rows array");

      let getKey: (row: T, index: number) => unknown;
      if (typeof key === "string") {
        assertSafeKey(key, "groupBy");
        getKey = (row) => (row as Record<string, unknown>)[key];
      } else if (typeof key === "function") {
        getKey = key;
      } else {
        throw new Error("groupBy: key must be a string or function");
      }

      const by = new Map<string, { key: string | number; rows: T[] }>();
      const ordered: Array<{ key: string | number; rows: T[] }> = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!row || typeof row !== "object") throw new Error("groupBy: expected row objects");
        const kv = getKey(row as T, i);
        const kind = typeof kv;
        if (kind !== "string" && kind !== "number") {
          throw new Error("groupBy: key values must be strings or numbers");
        }
        if (kind === "number" && !Number.isFinite(kv as number)) {
          throw new Error("groupBy: key values must be finite numbers");
        }
        const keyValue = kv as string | number;
        const mapKey = kind === "number" ? `n:${String(keyValue)}` : `s:${String(keyValue)}`;
        const existing = by.get(mapKey);
        if (existing) {
          existing.rows.push(row as T);
          continue;
        }
        const group = { key: keyValue, rows: [row as T] };
        by.set(mapKey, group);
        ordered.push(group);
      }

      return ordered;
    },
    agg<T extends Record<string, unknown>, TOut extends Record<string, unknown>>(
      groups: unknown,
      mapper: (group: { key: string | number; rows: T[] }, index: number) => TOut
    ): TOut[] {
      if (!Array.isArray(groups)) throw new Error("agg: expected groups array");
      if (typeof mapper !== "function") throw new Error("agg: expected mapper function");

      const out: TOut[] = [];
      for (let i = 0; i < groups.length; i++) {
        const g = groups[i];
        if (!g || typeof g !== "object") throw new Error("agg: expected group objects");
        const obj = g as Record<string, unknown>;
        const key = obj.key;
        const rows = obj.rows;
        if ((typeof key !== "string" && typeof key !== "number") || (typeof key === "number" && !Number.isFinite(key))) {
          throw new Error("agg: group.key must be string or finite number");
        }
        if (!Array.isArray(rows)) throw new Error("agg: group.rows must be an array");

        const mapped = mapper({ key, rows: rows as T[] }, i);
        if (!mapped || typeof mapped !== "object" || Array.isArray(mapped)) throw new Error("agg: mapper must return an object");
        const row: Record<string, unknown> = Object.create(null);
        for (const k of Object.keys(mapped)) {
          assertSafeKey(k, "agg");
          row[k] = (mapped as Record<string, unknown>)[k];
        }
        out.push(row as TOut);
      }
      return out;
    },
    join(
      leftRows: unknown,
      rightRows: unknown,
      opts: {
        leftKey: string;
        rightKey: string;
        how?: "inner" | "left";
        rightPrefix?: string;
      }
    ): Record<string, unknown>[] {
      if (!Array.isArray(leftRows)) throw new Error("join: expected leftRows array");
      if (!Array.isArray(rightRows)) throw new Error("join: expected rightRows array");
      if (!opts || typeof opts !== "object") throw new Error("join: expected opts object");

      const leftKey = (opts as { leftKey?: unknown }).leftKey;
      const rightKey = (opts as { rightKey?: unknown }).rightKey;
      if (typeof leftKey !== "string") throw new Error("join: leftKey must be string");
      if (typeof rightKey !== "string") throw new Error("join: rightKey must be string");
      assertSafeKey(leftKey, "join");
      assertSafeKey(rightKey, "join");

      const how = (opts as { how?: unknown }).how;
      const mode = how === undefined ? "inner" : how;
      if (mode !== "inner" && mode !== "left") throw new Error("join: how must be 'inner' or 'left'");

      const rightPrefixRaw = (opts as { rightPrefix?: unknown }).rightPrefix;
      const rightPrefix = typeof rightPrefixRaw === "string" ? rightPrefixRaw : "right_";

      const index = new Map<string, Record<string, unknown>[]>();
      for (const rr of rightRows) {
        if (!rr || typeof rr !== "object") throw new Error("join: expected right row objects");
        const keyValue = (rr as Record<string, unknown>)[rightKey];
        const mk = mapKeyOf(keyValue);
        if (mk === null) throw new Error("join: right key values must be string or finite number");
        const bucket = index.get(mk) ?? [];
        bucket.push(rr as Record<string, unknown>);
        index.set(mk, bucket);
      }

      const out: Record<string, unknown>[] = [];

      function merge(left: Record<string, unknown>, right: Record<string, unknown> | null): Record<string, unknown> {
        const row: Record<string, unknown> = Object.create(null);

        for (const k of Object.keys(left)) {
          assertSafeKey(k, "join");
          row[k] = left[k];
        }

        if (right) {
          for (const k of Object.keys(right)) {
            assertSafeKey(k, "join");
            const targetKey = Object.prototype.hasOwnProperty.call(row, k) ? `${rightPrefix}${k}` : k;
            assertSafeKey(targetKey, "join");
            if (Object.prototype.hasOwnProperty.call(row, targetKey)) {
              throw new Error(`join: key collision for '${targetKey}'`);
            }
            row[targetKey] = right[k];
          }
        }

        return row;
      }

      for (const lr of leftRows) {
        if (!lr || typeof lr !== "object") throw new Error("join: expected left row objects");
        const leftObj = lr as Record<string, unknown>;
        const keyValue = leftObj[leftKey];
        const mk = mapKeyOf(keyValue);
        if (mk === null) throw new Error("join: left key values must be string or finite number");

        const matches = index.get(mk) ?? [];
        if (matches.length === 0) {
          if (mode === "left") out.push(merge(leftObj, null));
          continue;
        }
        for (const rr of matches) out.push(merge(leftObj, rr));
      }

      return out;
    },
  });
}
