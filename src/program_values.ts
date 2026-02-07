/**
 * Purpose: Normalize override and table cell values for program evaluation.
 * Intent: Keep input/table coercion consistent with CalcDown type semantics.
 */

import type { InputDefinition, InputType, InputValue } from "./types.js";
import { parseIsoDate } from "./util/date.js";

function isZeroDecimalCurrencyType(type: InputType): boolean {
  if (type.name !== "currency") return false;
  const code = (type.args[0] ?? "").trim().toUpperCase();
  return code === "ISK";
}

export function normalizeOverrideValue(def: InputDefinition, value: unknown): InputValue {
  if (def.type.name === "date") {
    if (value instanceof Date) return value;
    if (typeof value === "string") return parseIsoDate(value);
    throw new Error(`Invalid override for ${def.name} (expected date string)`);
  }

  if (def.type.name === "integer") {
    if (typeof value === "number") {
      if (!Number.isFinite(value)) throw new Error(`Invalid override for ${def.name} (expected integer)`);
      return Math.trunc(value);
    }
    if (typeof value === "string") {
      const n = Number(value);
      if (!Number.isFinite(n)) throw new Error(`Invalid override for ${def.name} (expected integer)`);
      return Math.trunc(n);
    }
    throw new Error(`Invalid override for ${def.name} (expected integer)`);
  }

  if (def.type.name === "number" || def.type.name === "decimal" || def.type.name === "percent" || def.type.name === "currency") {
    const forceInteger = isZeroDecimalCurrencyType(def.type);
    if (typeof value === "number") {
      if (!Number.isFinite(value)) throw new Error(`Invalid override for ${def.name} (expected number)`);
      return forceInteger ? Math.round(value) : value;
    }
    if (typeof value === "string") {
      const n = Number(value);
      if (!Number.isFinite(n)) throw new Error(`Invalid override for ${def.name} (expected number)`);
      return forceInteger ? Math.round(n) : n;
    }
    throw new Error(`Invalid override for ${def.name} (expected number)`);
  }

  if (typeof def.defaultValue === "number") {
    if (typeof value === "number") {
      if (!Number.isFinite(value)) throw new Error(`Invalid override for ${def.name} (expected number)`);
      return value;
    }
    if (typeof value === "string") {
      const n = Number(value);
      if (!Number.isFinite(n)) throw new Error(`Invalid override for ${def.name} (expected number)`);
      return n;
    }
    throw new Error(`Invalid override for ${def.name} (expected number)`);
  }

  if (typeof def.defaultValue === "boolean") {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      if (value === "true") return true;
      if (value === "false") return false;
    }
    throw new Error(`Invalid override for ${def.name} (expected boolean)`);
  }

  if (typeof def.defaultValue === "string") {
    if (typeof value === "string") return value;
    return String(value);
  }

  return def.defaultValue;
}

export function toPkString(value: unknown): string | null {
  if (typeof value === "string" && value) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

export function cloneTableRows(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return value.map((row) => {
    if (row instanceof Date) return row;
    if (!row || typeof row !== "object" || Array.isArray(row)) return row;
    const out: Record<string, unknown> = Object.create(null);
    for (const k of Object.keys(row as Record<string, unknown>)) out[k] = (row as Record<string, unknown>)[k];
    return out;
  });
}

export function coerceTableCellValue(type: InputType, value: unknown): unknown {
  const t = type.name;

  if (t === "string") return typeof value === "string" ? value : String(value);

  if (t === "boolean") {
    if (typeof value === "boolean") return value;
    if (value === "true") return true;
    if (value === "false") return false;
    if (value === 1 || value === "1") return true;
    if (value === 0 || value === "0") return false;
    throw new Error("Expected boolean value");
  }

  if (t === "integer") {
    const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
    if (!Number.isFinite(n)) throw new Error("Expected integer value");
    return Math.trunc(n);
  }

  if (t === "number" || t === "decimal" || t === "percent" || t === "currency") {
    const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
    if (!Number.isFinite(n)) throw new Error("Expected numeric value");
    return isZeroDecimalCurrencyType(type) ? Math.round(n) : n;
  }

  if (t === "date") {
    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) throw new Error("Expected valid Date");
      return value;
    }
    if (typeof value === "string") return parseIsoDate(value);
    throw new Error("Expected date value");
  }

  if (t === "datetime") {
    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) throw new Error("Expected valid Date");
      return value;
    }
    if (typeof value === "string" && value.trim()) {
      const d = new Date(value.trim());
      if (Number.isNaN(d.getTime())) throw new Error("Invalid datetime");
      return d;
    }
    throw new Error("Expected datetime value");
  }

  return value;
}
