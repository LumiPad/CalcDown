/**
 * Purpose: Implement sequence, filter, sorting, and scan helpers for std.data.
 * Intent: Keep table-friendly array operations deterministic and validation-focused.
 */

import { assertSafeKey, makeModule } from "./std_shared.js";

type SortDirection = "asc" | "desc";

export type DataSortByFn = <T extends Record<string, unknown>>(
  rows: unknown,
  key: string,
  direction?: SortDirection
) => T[];

export interface StdDataModule {
  sequence(count: number, opts?: { start?: number; step?: number }): number[];
  filter<T>(items: T[], predicate: (item: T, index: number) => unknown): T[];
  sortBy: DataSortByFn;
  last<T>(items: T[]): T;
  scan<TItem, TState>(
    items: TItem[],
    reducer: (state: TState, item: TItem, index: number) => TState,
    seedOrOptions: TState | { seed: TState }
  ): TState[];
}

export function createDataModule(): Readonly<StdDataModule> {
  const sortBy: DataSortByFn = <T extends Record<string, unknown>>(
    rows: unknown,
    key: string,
    direction: SortDirection = "asc"
  ): T[] => {
    if (!Array.isArray(rows)) throw new Error("sortBy: expected rows array");
    assertSafeKey(key, "sortBy");
    if (direction !== "asc" && direction !== "desc") throw new Error("sortBy: direction must be 'asc' or 'desc'");

    type SortKey = { kind: "none" } | { kind: "number"; value: number } | { kind: "string"; value: string };

    function getKey(row: unknown): SortKey {
      if (!row || typeof row !== "object") throw new Error("sortBy: expected row objects");
      const rec = row as Record<string, unknown>;
      const v = Object.prototype.hasOwnProperty.call(rec, key) ? rec[key] : undefined;
      if (v === undefined || v === null) return { kind: "none" };
      if (v instanceof Date) return { kind: "number", value: v.getTime() };
      if (typeof v === "number") {
        if (!Number.isFinite(v)) throw new Error("sortBy: expected finite number keys");
        return { kind: "number", value: v };
      }
      if (typeof v === "string") return { kind: "string", value: v };
      throw new Error("sortBy: unsupported key type");
    }

    const withKeys = (rows as unknown[]).map((row, index) => ({ row, index, k: getKey(row) }));

    let kind: SortKey["kind"] | null = null;
    for (const r of withKeys) {
      if (r.k.kind === "none") continue;
      kind = kind ?? r.k.kind;
      if (kind !== r.k.kind) throw new Error("sortBy: mixed key types");
    }

    const dir = direction === "desc" ? -1 : 1;
    withKeys.sort((a, b) => {
      const ak = a.k;
      const bk = b.k;
      if (ak.kind === "none" && bk.kind === "none") return a.index - b.index;
      if (ak.kind === "none") return 1;
      if (bk.kind === "none") return -1;
      if (ak.kind === "number") {
        const d = ak.value - (bk as Extract<SortKey, { kind: "number" }>).value;
        if (d !== 0) return d * dir;
        return a.index - b.index;
      }
      const cmp =
        ak.value < (bk as Extract<SortKey, { kind: "string" }>).value
          ? -1
          : ak.value > (bk as Extract<SortKey, { kind: "string" }>).value
            ? 1
            : 0;
      if (cmp !== 0) return cmp * dir;
      return a.index - b.index;
    });

    return withKeys.map((r) => r.row as T);
  };

  return makeModule({
    sequence(count: number, opts?: { start?: number; step?: number }): number[] {
      if (!Number.isFinite(count) || !Number.isInteger(count) || count < 0) {
        throw new Error("sequence: count must be a non-negative integer");
      }
      const start = opts?.start ?? 1;
      const step = opts?.step ?? 1;
      const out = new Array<number>(count);
      for (let i = 0; i < count; i++) out[i] = start + i * step;
      return out;
    },
    filter<T>(items: T[], predicate: (item: T, index: number) => unknown): T[] {
      if (!Array.isArray(items)) throw new Error("filter: expected array");
      if (typeof predicate !== "function") throw new Error("filter: expected predicate function");
      const out: T[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i]!;
        if (predicate(item, i)) out.push(item);
      }
      return out;
    },
    sortBy,
    last<T>(items: T[]): T {
      if (!Array.isArray(items)) throw new Error("last: expected array");
      if (items.length === 0) throw new Error("last: empty array");
      return items[items.length - 1]!;
    },
    scan<TItem, TState>(
      items: TItem[],
      reducer: (state: TState, item: TItem, index: number) => TState,
      seedOrOptions: TState | { seed: TState }
    ): TState[] {
      if (!Array.isArray(items)) throw new Error("scan: expected array items");
      if (typeof reducer !== "function") throw new Error("scan: expected reducer function");
      const seed =
        seedOrOptions &&
        typeof seedOrOptions === "object" &&
        "seed" in seedOrOptions &&
        Object.prototype.hasOwnProperty.call(seedOrOptions, "seed")
          ? (seedOrOptions as { seed: TState }).seed
          : (seedOrOptions as TState);
      const out: TState[] = [];
      let state = seed;
      for (let i = 0; i < items.length; i++) {
        state = reducer(state, items[i]!, i);
        out.push(state);
      }
      return out;
    },
  });
}
