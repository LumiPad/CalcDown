/**
 * Purpose: Provide shared utilities for CalcDown std module construction.
 * Intent: Keep safety checks and object-shape conventions consistent across modules.
 */

export type Module = Record<string, unknown>;

export interface StdRuntimeContext {
  currentDateTime?: Date;
}

const bannedProperties = new Set(["__proto__", "prototype", "constructor"]);

export function makeModule<T extends Module>(entries: T): Readonly<T> {
  const obj = Object.assign(Object.create(null), entries) as T;
  return Object.freeze(obj);
}

export function assertSafeKey(key: string, prefix: string): void {
  if (!key) throw new Error(`${prefix}: expected key string`);
  if (bannedProperties.has(key)) throw new Error(`${prefix}: disallowed key: ${key}`);
}

export function mapKeyOf(v: unknown): string | null {
  if (typeof v === "string") return `s:${v}`;
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return null;
    return `n:${String(v)}`;
  }
  return null;
}

export function textPartToString(v: unknown, label: string): string {
  if (typeof v === "string") return v;
  if (typeof v === "number") {
    if (!Number.isFinite(v)) throw new Error(`${label}: expected finite numbers`);
    return String(v);
  }
  throw new Error(`${label}: expected string or finite number`);
}

export function pmt(rate: number, nper: number, pv: number, fv = 0, type = 0): number {
  if (!Number.isFinite(rate) || !Number.isFinite(nper) || !Number.isFinite(pv) || !Number.isFinite(fv)) {
    throw new Error("pmt: invalid arguments");
  }
  if (nper === 0) throw new Error("pmt: nper must be non-zero");
  if (type !== 0 && type !== 1) throw new Error("pmt: type must be 0 or 1");
  if (rate === 0) return -(pv + fv) / nper;
  const pow = (1 + rate) ** nper;
  return -(rate * (fv + pv * pow)) / ((1 + rate * type) * (pow - 1));
}

export function makeNowGetter(context?: StdRuntimeContext): () => Date {
  const hasKey = Boolean(context) && Object.prototype.hasOwnProperty.call(context, "currentDateTime");
  if (!hasKey) return () => new Date();

  const dt = context?.currentDateTime;
  if (!(dt instanceof Date) || Number.isNaN(dt.getTime())) throw new Error("std: invalid currentDateTime");
  const fixed = new Date(dt.getTime());
  return () => new Date(fixed.getTime());
}

export function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if ((typeof value !== "object" && typeof value !== "function") || value === null) return value;
  const obj = value as unknown as object;
  if (seen.has(obj)) return value;
  seen.add(obj);

  for (const key of Object.keys(value as unknown as Record<string, unknown>)) {
    deepFreeze((value as unknown as Record<string, unknown>)[key], seen);
  }
  Object.freeze(value as unknown as object);
  return value;
}
