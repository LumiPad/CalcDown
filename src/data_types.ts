/**
 * Purpose: Parse declared data-column types and coerce scalar values safely.
 * Intent: Keep type semantics consistent across inline and external tables.
 */

import type { InputType } from "./types.js";
import { parseIsoDate } from "./util/date.js";

const coreTypes = new Set([
  "string",
  "boolean",
  "number",
  "integer",
  "decimal",
  "percent",
  "currency",
  "date",
  "datetime",
]);

function normalizeTypeName(name: string): string {
  const trimmed = name.trim();
  const lower = trimmed.toLowerCase();
  return coreTypes.has(lower) ? lower : trimmed;
}

function normalizeTypeArgs(typeName: string, args: string[]): string[] {
  if (typeName !== "currency" || args.length === 0) return args;
  const first = args[0] ?? "";
  const quoted = first.match(/^"(.*)"$/) ?? first.match(/^'(.*)'$/);
  const unquoted = quoted ? (quoted[1] ?? "") : first;
  args[0] = unquoted.trim().toUpperCase();
  return args;
}

export function parseType(raw: string): InputType {
  const trimmed = raw.trim();
  const openParen = trimmed.indexOf("(");
  const openBracket = trimmed.indexOf("[");
  if (openParen === -1 && openBracket === -1) {
    const name = normalizeTypeName(trimmed);
    return { name, args: [], raw: trimmed };
  }

  let open = openParen;
  let closeChar: ")" | "]" = ")";
  if (openBracket !== -1 && (openParen === -1 || openBracket < openParen)) {
    open = openBracket;
    closeChar = "]";
  }

  const close = trimmed.lastIndexOf(closeChar);
  if (close === -1 || close < open) {
    const name = normalizeTypeName(trimmed);
    return { name, args: [], raw: trimmed };
  }

  const name = normalizeTypeName(trimmed.slice(0, open));
  const argsText = trimmed.slice(open + 1, close).trim();
  const args = normalizeTypeArgs(
    name,
    argsText ? argsText.split(",").map((s) => s.trim()).filter(Boolean) : []
  );
  return { name, args, raw: trimmed };
}

export function parseScalarByType(type: InputType, value: unknown): unknown {
  switch (type.name) {
    case "string":
      if (typeof value !== "string") throw new Error(`Expected string, got ${typeof value}`);
      return value;
    case "boolean":
      if (typeof value !== "boolean") throw new Error(`Expected boolean, got ${typeof value}`);
      return value;
    case "integer":
      if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)) {
        throw new Error("Expected integer");
      }
      return value;
    case "number":
    case "decimal":
    case "percent":
      if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("Expected number");
      return value;
    case "currency":
      if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("Expected number");
      if ((type.args[0] ?? "").trim().toUpperCase() === "ISK") return Math.round(value);
      return value;
    case "date":
      if (typeof value !== "string") throw new Error("Expected ISO date string");
      return parseIsoDate(value);
    case "datetime": {
      if (typeof value !== "string") throw new Error("Expected datetime string");
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) throw new Error("Invalid datetime");
      return d;
    }
    default:
      return value;
  }
}

export function isIdent(name: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
}
