import { addMonthsUTC } from "../util/date.js";

type Module = Record<string, unknown>;

function makeModule<T extends Module>(entries: T): Readonly<T> {
  const obj = Object.assign(Object.create(null), entries) as T;
  return Object.freeze(obj);
}

function pmt(rate: number, nper: number, pv: number, fv = 0, type = 0): number {
  if (!Number.isFinite(rate) || !Number.isFinite(nper) || !Number.isFinite(pv)) {
    throw new Error("pmt: invalid arguments");
  }
  if (nper === 0) throw new Error("pmt: nper must be non-zero");
  if (rate === 0) return -(pv + fv) / nper;
  const pow = (1 + rate) ** nper;
  return -(rate * (fv + pv * pow)) / ((1 + rate * type) * (pow - 1));
}

export const std = makeModule({
  math: makeModule({
    sum(xs: unknown): number {
      if (!Array.isArray(xs)) throw new Error("sum: expected array");
      let s = 0;
      for (const v of xs) {
        if (typeof v !== "number") throw new Error("sum: expected number array");
        s += v;
      }
      return s;
    },
  }),

  data: makeModule({
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
  }),

  date: makeModule({
    addMonths(date: Date, months: number): Date {
      if (!(date instanceof Date) || Number.isNaN(date.getTime())) throw new Error("addMonths: invalid date");
      if (!Number.isFinite(months) || !Number.isInteger(months)) throw new Error("addMonths: months must be integer");
      return addMonthsUTC(date, months);
    },
  }),

  finance: makeModule({
    toMonthlyRate(annualPercent: number): number {
      if (!Number.isFinite(annualPercent)) throw new Error("toMonthlyRate: annualPercent must be finite");
      return annualPercent / 100 / 12;
    },
    pmt,
  }),

  assert: makeModule({
    that(condition: unknown, message = "Assertion failed"): void {
      if (!condition) throw new Error(message);
    },
  }),
});
