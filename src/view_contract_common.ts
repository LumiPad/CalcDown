/**
 * Purpose: Provide shared utilities for view-contract validation diagnostics.
 * Intent: Centralize key safety checks, labels, and normalized message helpers.
 */

import type { CalcdownMessage } from "./types.js";
import type { ParsedView } from "./views.js";

export const bannedKeys = new Set(["__proto__", "prototype", "constructor"]);

export function err(
  messages: CalcdownMessage[],
  line: number,
  code: string,
  message: string,
  extra?: Omit<CalcdownMessage, "severity" | "message" | "line">
): void {
  messages.push({ severity: "error", code, message, line, ...(extra ?? {}) });
}

export function warn(
  messages: CalcdownMessage[],
  line: number,
  code: string,
  message: string,
  extra?: Omit<CalcdownMessage, "severity" | "message" | "line">
): void {
  messages.push({ severity: "warning", code, message, line, ...(extra ?? {}) });
}

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

export function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

export function sanitizeId(id: string): string {
  return id.trim();
}

const labelAbbreviations = new Map<string, string>([
  ["id", "ID"],
  ["pk", "PK"],
  ["url", "URL"],
  ["api", "API"],
  ["ui", "UI"],
  ["ip", "IP"],
  ["csv", "CSV"],
  ["json", "JSON"],
  ["jsonl", "JSONL"],
  ["yaml", "YAML"],
  ["sse", "SSE"],
  ["http", "HTTP"],
  ["https", "HTTPS"],
  ["sha256", "SHA-256"],
]);

export function defaultLabelForKey(key: string): string {
  const raw = key.trim();
  if (!raw) return key;
  if (!raw.includes("_") && !raw.includes("-")) return key;

  const parts = raw.split(/[_-]+/).filter(Boolean);
  if (parts.length === 0) return key;

  const words = parts.map((part) => {
    const lower = part.toLowerCase();
    const abbr = labelAbbreviations.get(lower);
    if (abbr) return abbr;
    const first = part[0];
    if (!first) return part;
    return first.toUpperCase() + part.slice(1);
  });

  return words.join(" ");
}

export function normalizeParsedView(raw: ParsedView): ParsedView {
  const library = raw.library ? raw.library : "calcdown";
  return Object.assign(Object.create(null), raw, { library });
}
