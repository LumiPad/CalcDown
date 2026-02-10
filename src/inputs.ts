/**
 * Purpose: Parse CalcDown inputs blocks into typed input definitions.
 * Intent: Normalize core type syntax and validate default values with line metadata.
 */

import {
  CalcdownMessage,
  FencedCodeBlock,
  InputConstraints,
  InputDefinition,
  InputType,
  InputValue,
} from "./types.js";
import { parseIsoDate } from "./util/date.js";

const coreTypes = new Set(["string", "boolean", "number", "integer", "decimal", "percent", "currency", "date", "datetime"]);
const numericTypes = new Set(["number", "integer", "decimal", "percent", "currency"]);

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

function parseInputType(raw: string): InputType {
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

  const name = normalizeTypeName(trimmed.slice(0, open));
  const argsText = trimmed.slice(open + 1, close).trim();
  const args = normalizeTypeArgs(
    name,
    argsText ? argsText.split(",").map((s) => s.trim()).filter(Boolean) : []
  );
  return { name, args, raw: trimmed };
}

function parseDefaultValue(type: InputType, text: string): InputValue {
  const t = text.trim();
  switch (type.name) {
    case "string": {
      const m = t.match(/^"(.*)"$/) ?? t.match(/^'(.*)'$/);
      return m ? (m[1] ?? "") : t;
    }
    case "boolean": {
      if (t === "true") return true;
      if (t === "false") return false;
      throw new Error(`Invalid boolean default: ${t}`);
    }
    case "date": {
      return parseIsoDate(t);
    }
    case "integer": {
      const n = Number(t);
      if (!Number.isFinite(n) || !Number.isInteger(n)) throw new Error(`Invalid integer default: ${t}`);
      return n;
    }
    case "number":
    case "decimal":
    case "percent": {
      const n = Number(t);
      if (!Number.isFinite(n)) throw new Error(`Invalid numeric default: ${t}`);
      return n;
    }
    case "currency": {
      const n = Number(t);
      if (!Number.isFinite(n)) throw new Error(`Invalid numeric default: ${t}`);
      if ((type.args[0] ?? "").trim().toUpperCase() === "ISK") return Math.round(n);
      return n;
    }
    default: {
      const n = Number(t);
      if (Number.isFinite(n)) return n;
      return t;
    }
  }
}

function splitDefaultAndConstraints(defaultGroup: string): { defaultText: string; constraintsText: string | null } {
  const trimmed = defaultGroup.trim();
  if (!trimmed.endsWith("]")) return { defaultText: trimmed, constraintsText: null };
  const open = trimmed.lastIndexOf("[");
  if (open === -1) return { defaultText: trimmed, constraintsText: null };
  if (open > 0 && !/\s/.test(trimmed[open - 1] ?? "")) return { defaultText: trimmed, constraintsText: null };

  const defaultText = trimmed.slice(0, open).trim();
  if (!defaultText) return { defaultText: trimmed, constraintsText: null };
  const constraintsText = trimmed.slice(open + 1, trimmed.length - 1).trim();
  return { defaultText, constraintsText };
}

function parseConstraints(text: string): InputConstraints {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("Invalid constraints: empty list");

  const out: InputConstraints = Object.create(null);
  const parts = trimmed.split(",").map((s) => s.trim()).filter(Boolean);
  for (const part of parts) {
    const m = part.match(/^(min|max)\s*:\s*(.+)$/);
    if (!m) throw new Error(`Invalid constraint: ${part}`);
    const key = m[1] as "min" | "max";
    const rawValue = (m[2] ?? "").trim();
    if (!rawValue) throw new Error(`Invalid constraint: ${part}`);
    const n = Number(rawValue);
    if (!Number.isFinite(n)) throw new Error(`Invalid ${key} constraint: ${rawValue}`);
    if (Object.prototype.hasOwnProperty.call(out, key)) throw new Error(`Duplicate constraint: ${key}`);
    out[key] = n;
  }

  const min = out.min;
  const max = out.max;
  if (typeof min === "number" && typeof max === "number" && min > max) {
    throw new Error("Invalid constraints: min must be <= max");
  }

  return out;
}

function isIntegerConstrainedType(type: InputType): boolean {
  if (type.name === "integer") return true;
  if (type.name !== "currency") return false;
  const code = (type.args[0] ?? "").trim().toUpperCase();
  return code === "ISK";
}

function assertConstraintsAreSupported(type: InputType, defaultValue: InputValue, constraints: InputConstraints): void {
  if (constraints.min === undefined && constraints.max === undefined) {
    throw new Error("Invalid constraints: expected min and/or max");
  }
  if (!numericTypes.has(type.name) && typeof defaultValue !== "number") {
    throw new Error("Invalid constraints: only numeric inputs support min/max");
  }

  if (isIntegerConstrainedType(type)) {
    if (constraints.min !== undefined && !Number.isInteger(constraints.min)) throw new Error("Invalid constraints: min must be integer");
    if (constraints.max !== undefined && !Number.isInteger(constraints.max)) throw new Error("Invalid constraints: max must be integer");
  }
}

function assertDefaultWithinConstraints(defaultValue: InputValue, constraints: InputConstraints): void {
  if (typeof defaultValue !== "number") return;
  const min = constraints.min;
  const max = constraints.max;
  if (typeof min === "number" && defaultValue < min) throw new Error(`Default is below min: ${min}`);
  if (typeof max === "number" && defaultValue > max) throw new Error(`Default is above max: ${max}`);
}

export function parseInputsBlock(block: FencedCodeBlock): {
  inputs: InputDefinition[];
  messages: CalcdownMessage[];
} {
  const messages: CalcdownMessage[] = [];
  const inputs: InputDefinition[] = [];

  const seen = new Set<string>();
  const lines = block.content.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    if (rawLine === undefined) continue;
    const lineNumber = block.fenceLine + 1 + i;
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const commentIdx = rawLine.indexOf("#");
    const withoutComment = (commentIdx === -1 ? rawLine : rawLine.slice(0, commentIdx)).trim();
    if (!withoutComment) continue;

    const m = withoutComment.match(
      /^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([A-Za-z_][A-Za-z0-9_]*(?:\([^)]*\)|\[[^\]]*\])?)\s*=\s*(.+)$/
    );
    if (!m) {
      messages.push({
        severity: "error",
        code: "CD_INPUT_INVALID_LINE",
        message: `Invalid input line: ${withoutComment}`,
        line: lineNumber,
        blockLang: block.lang,
      });
      continue;
    }

    const name = m[1]!;
    const typeRaw = m[2]!;
    const defaultGroup = m[3]!;

    const type = parseInputType(typeRaw);
    const split = splitDefaultAndConstraints(defaultGroup);
    const defaultText = split.defaultText;
    let constraints: InputConstraints | null = null;
    if (split.constraintsText !== null) {
      try {
        constraints = parseConstraints(split.constraintsText);
      } catch (err) {
        messages.push({
          severity: "error",
          code: "CD_INPUT_INVALID_CONSTRAINTS",
          message: err instanceof Error ? err.message : String(err),
          line: lineNumber,
          blockLang: block.lang,
          nodeName: name,
        });
        continue;
      }
    }

    if (seen.has(name)) {
      messages.push({
        severity: "error",
        code: "CD_INPUT_DUPLICATE_NAME",
        message: `Duplicate input name: ${name}`,
        line: lineNumber,
        blockLang: block.lang,
        nodeName: name,
      });
      continue;
    }
    seen.add(name);

    let defaultValue: InputValue;
    try {
      defaultValue = parseDefaultValue(type, defaultText);
    } catch (err) {
      messages.push({
        severity: "error",
        code: "CD_INPUT_INVALID_DEFAULT",
        message: err instanceof Error ? err.message : String(err),
        line: lineNumber,
        blockLang: block.lang,
        nodeName: name,
      });
      continue;
    }

    if (constraints) {
      try {
        assertConstraintsAreSupported(type, defaultValue, constraints);
        assertDefaultWithinConstraints(defaultValue, constraints);
      } catch (err) {
        messages.push({
          severity: "error",
          code: "CD_INPUT_INVALID_CONSTRAINTS",
          message: err instanceof Error ? err.message : String(err),
          line: lineNumber,
          blockLang: block.lang,
          nodeName: name,
        });
        continue;
      }
    }

    inputs.push(
      Object.assign(Object.create(null), {
        name,
        type,
        defaultText,
        defaultValue,
        ...(constraints ? { constraints } : {}),
        line: lineNumber,
      })
    );
  }

  return { inputs, messages };
}
