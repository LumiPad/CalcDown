/**
 * Purpose: Format scalar and typed values for web view presentation.
 * Intent: Apply consistent locale-aware rendering with CalcDown format semantics.
 */

import { formatIsoDate } from "../util/date.js";
import type { ValueFormat } from "../view_contract.js";

function shouldGroupInteger(n: number): boolean {
  if (!Number.isInteger(n)) return true;
  const abs = Math.abs(n);
  // Avoid "2,004" for year-like values.
  if (abs >= 1000 && abs < 10000) return false;
  return true;
}

export function formatValue(v: unknown): string {
  if (v instanceof Date) return formatIsoDate(v);
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return String(v);
    const useGrouping = shouldGroupInteger(v);
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 6, useGrouping }).format(v);
  }
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "string") return v;
  if (v === null) return "null";
  if (v === undefined) return "—";
  if (Array.isArray(v)) return `[array × ${v.length}]`;
  return "[object]";
}

export function formatFormattedValue(v: unknown, fmt: ValueFormat | undefined): string {
  if (!fmt) return formatValue(v);

  const rawKind = typeof fmt === "string" ? fmt : fmt.kind;
  const kind =
    rawKind === "percent01" || rawKind === "percent_ratio"
      ? "percent"
      : rawKind === "percent_points"
        ? "percent"
        : rawKind;
  const scale =
    typeof fmt === "string"
      ? rawKind === "percent01" || rawKind === "percent_ratio"
        ? 100
        : 1
      : typeof fmt.scale === "number" && Number.isFinite(fmt.scale)
        ? fmt.scale
        : 1;
  const digits =
    typeof fmt === "string"
      ? undefined
      : typeof fmt.digits === "number" && Number.isFinite(fmt.digits)
        ? Math.max(0, Math.min(12, Math.floor(fmt.digits)))
        : undefined;

  if (kind === "date") {
    if (v instanceof Date) return formatIsoDate(v);
    if (typeof v === "string") return v;
    return formatValue(v);
  }

  if (kind === "percent") {
    if (typeof v !== "number" || !Number.isFinite(v)) return formatValue(v);
    const nf = new Intl.NumberFormat(undefined, {
      maximumFractionDigits: digits ?? 2,
      minimumFractionDigits: digits ?? 0,
    });
    return `${nf.format(v * scale)}%`;
  }

  if (kind === "currency") {
    const currency = typeof fmt === "string" ? undefined : fmt.currency;
    if (typeof v !== "number" || !Number.isFinite(v) || !currency) return formatValue(v);
    const code = currency.trim().toUpperCase();
    // ISK has no minor unit in this product; always render whole króna.
    const fixedDigits = code === "ISK" ? 0 : digits;
    const nf = new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      ...(fixedDigits !== undefined
        ? { minimumFractionDigits: fixedDigits, maximumFractionDigits: fixedDigits }
        : {}),
    });
    return nf.format(v);
  }

  if (kind === "integer") {
    if (typeof v !== "number" || !Number.isFinite(v)) return formatValue(v);
    const n = Math.trunc(v);
    const nf = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0, useGrouping: shouldGroupInteger(n) });
    return nf.format(n);
  }

  // number
  if (typeof v !== "number" || !Number.isFinite(v)) return formatValue(v);
  const nf = new Intl.NumberFormat(undefined, {
    maximumFractionDigits: digits ?? 2,
    minimumFractionDigits: digits ?? 0,
  });
  return nf.format(v);
}
