/**
 * Purpose: Validate and normalize view value-format declarations.
 * Intent: Enforce format-kind constraints with stable view-contract diagnostics.
 */

import type { CalcdownMessage } from "./types.js";
import { asString, err, isPlainObject } from "./view_contract_common.js";
import type { ValueFormat } from "./view_contract_types.js";

function validateDigits(raw: unknown): number | null {
  if (raw === undefined) return null;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  const n = Math.floor(raw);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(12, n));
}

export function validateFormat(raw: unknown, line: number, messages: CalcdownMessage[]): ValueFormat | null {
  if (raw === undefined) return null;

  if (typeof raw === "string") {
    if (raw === "percent_points") return "percent";
    if (raw === "percent_ratio") return "percent01";
    if (
      raw === "number" ||
      raw === "integer" ||
      raw === "percent" ||
      raw === "percent01" ||
      raw === "currency" ||
      raw === "date"
    ) {
      return raw;
    }
    return null;
  }

  if (!isPlainObject(raw)) return null;
  const kind = asString(raw.kind);
  if (!kind) return null;
  if (kind !== "number" && kind !== "integer" && kind !== "percent" && kind !== "currency" && kind !== "date") {
    return null;
  }

  const digits = validateDigits(raw.digits);
  const currency = asString(raw.currency);
  const scaleRaw = raw.scale;
  const scale =
    scaleRaw === undefined
      ? null
      : typeof scaleRaw === "number" && Number.isFinite(scaleRaw) && scaleRaw > 0
        ? scaleRaw
        : null;

  if (kind !== "percent" && scaleRaw !== undefined) {
    err(messages, line, "CD_VIEW_FORMAT_SCALE_UNSUPPORTED", "format.scale is only supported when format.kind is 'percent'");
    return null;
  }

  if (kind === "percent" && scaleRaw !== undefined && scale === null) {
    err(messages, line, "CD_VIEW_FORMAT_SCALE_INVALID", "format.scale must be a finite number greater than 0");
    return null;
  }

  return Object.assign(Object.create(null), {
    kind,
    ...(digits !== null ? { digits } : {}),
    ...(currency ? { currency } : {}),
    ...(scale !== null ? { scale } : {}),
  }) as ValueFormat;
}
