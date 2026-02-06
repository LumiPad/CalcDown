/**
 * Purpose: Apply atomic source patches for inputs and inline table cells.
 * Intent: Preserve user-authored formatting while producing deterministic edits.
 */

import { formatIsoDate } from "../util/date.js";
import type { DataTable, InputDefinition, InputType } from "../types.js";

export type PatchOp =
  | { kind: "updateInput"; name: string; value: unknown }
  | { kind: "updateTableCell"; tableName: string; primaryKey: string | number; column: string; value: unknown };

export interface SourceMap {
  inputsByName: Map<string, InputDefinition>;
  tablesByName: Map<string, { table: DataTable; rowLineByPk: Map<string, number> }>;
}

function newlineForSource(source: string): "\n" | "\r\n" {
  return source.includes("\r\n") ? "\r\n" : "\n";
}

function toPkString(value: unknown): string | null {
  if (typeof value === "string" && value) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function inputDefaultText(type: InputType, value: unknown): string {
  switch (type.name) {
    case "string": {
      return JSON.stringify(typeof value === "string" ? value : String(value));
    }
    case "boolean": {
      if (typeof value === "boolean") return value ? "true" : "false";
      if (value === "true" || value === "false") return String(value);
      if (value === 1 || value === "1") return "true";
      if (value === 0 || value === "0") return "false";
      throw new Error("Expected boolean value");
    }
    case "date": {
      if (value instanceof Date) return formatIsoDate(value);
      if (typeof value === "string" && value.trim()) return value.trim();
      throw new Error("Expected date value");
    }
    case "datetime": {
      if (value instanceof Date) return value.toISOString();
      if (typeof value === "string" && value.trim()) return value.trim();
      throw new Error("Expected datetime value");
    }
    case "integer": {
      const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
      if (!Number.isFinite(n)) throw new Error("Expected integer value");
      return String(Math.trunc(n));
    }
    case "number":
    case "decimal":
    case "percent":
    case "currency": {
      const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
      if (!Number.isFinite(n)) throw new Error("Expected numeric value");
      return String(n);
    }
    default: {
      return JSON.stringify(value);
    }
  }
}

function jsonCellValue(type: InputType, value: unknown): unknown {
  switch (type.name) {
    case "string":
      return typeof value === "string" ? value : String(value);
    case "boolean": {
      if (typeof value === "boolean") return value;
      if (value === "true") return true;
      if (value === "false") return false;
      if (value === "1" || value === 1) return true;
      if (value === "0" || value === 0) return false;
      throw new Error("Expected boolean value");
    }
    case "integer": {
      const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
      if (!Number.isFinite(n)) throw new Error("Expected integer value");
      return Math.trunc(n);
    }
    case "number":
    case "decimal":
    case "percent":
    case "currency": {
      const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
      if (!Number.isFinite(n)) throw new Error("Expected numeric value");
      return n;
    }
    case "date": {
      if (value instanceof Date) return formatIsoDate(value);
      if (typeof value === "string" && value.trim()) return value.trim();
      throw new Error("Expected date value");
    }
    case "datetime": {
      if (value instanceof Date) return value.toISOString();
      if (typeof value === "string" && value.trim()) return value.trim();
      throw new Error("Expected datetime value");
    }
    default:
      return value;
  }
}

export function buildSourceMap(program: { inputs: InputDefinition[]; tables: DataTable[] }): SourceMap {
  const inputsByName = new Map<string, InputDefinition>();
  for (const def of program.inputs) inputsByName.set(def.name, def);

  const tablesByName = new Map<string, { table: DataTable; rowLineByPk: Map<string, number> }>();
  for (const table of program.tables) {
    const rowLineByPk = new Map<string, number>();
    const rowMap = table.rowMap;
    if (Array.isArray(rowMap)) {
      for (const entry of rowMap) {
        if (!entry || typeof entry !== "object") continue;
        if (typeof entry.primaryKey !== "string" || !entry.primaryKey) continue;
        if (typeof entry.line !== "number" || !Number.isFinite(entry.line)) continue;
        rowLineByPk.set(entry.primaryKey, entry.line);
      }
    }
    tablesByName.set(table.name, { table, rowLineByPk });
  }

  return { inputsByName, tablesByName };
}

export function applyPatch(source: string, op: PatchOp, map: SourceMap): string {
  const newline = newlineForSource(source);
  const lines = source.split(/\r?\n/);

  if (op.kind === "updateInput") {
    const def = map.inputsByName.get(op.name);
    if (!def) throw new Error(`Input not found: ${op.name}`);

    const lineIdx = def.line - 1;
    const currentLine = lines[lineIdx];
    if (currentLine === undefined) throw new Error(`Input line out of range: ${op.name}`);

    const commentIdx = currentLine.indexOf("#");
    const beforeComment = commentIdx === -1 ? currentLine : currentLine.slice(0, commentIdx);
    const comment = commentIdx === -1 ? "" : currentLine.slice(commentIdx);

    const eqIdx = beforeComment.indexOf("=");
    if (eqIdx === -1) throw new Error(`Could not find '=' when patching input: ${op.name}`);

    const prefix = beforeComment.slice(0, eqIdx + 1);
    const afterEq = beforeComment.slice(eqIdx + 1);
    const wsAfterEq = afterEq.match(/^\s*/)?.[0] ?? "";
    const trailing = afterEq.match(/\s*$/)?.[0] ?? "";
    const nextValue = inputDefaultText(def.type, op.value);

    lines[lineIdx] = `${prefix}${wsAfterEq}${nextValue}${trailing}${comment}`;
    return lines.join(newline);
  }

  if (op.kind === "updateTableCell") {
    const entry = map.tablesByName.get(op.tableName);
    if (!entry) throw new Error(`Table not found: ${op.tableName}`);

    const table = entry.table;
    if (table.source) {
      throw new Error(`External data tables are read-only: ${op.tableName}`);
    }

    const pk = toPkString(op.primaryKey);
    if (!pk) throw new Error(`Invalid primaryKey for patch: ${String(op.primaryKey)}`);

    const lineNumber = entry.rowLineByPk.get(pk);
    if (lineNumber === undefined) throw new Error(`Row not found in table '${op.tableName}': ${pk}`);

    const lineIdx = lineNumber - 1;
    const currentLine = lines[lineIdx];
    if (currentLine === undefined) throw new Error(`Row line out of range for '${op.tableName}': ${pk}`);

    const indent = currentLine.match(/^\s*/)?.[0] ?? "";
    const rest = currentLine.slice(indent.length);
    const trimmedEnd = rest.trimEnd();
    const trailing = rest.slice(trimmedEnd.length);
    const jsonText = trimmedEnd.trim();
    if (!jsonText) throw new Error(`Empty JSONL row at ${op.tableName}:${pk}`);

    let row: unknown;
    try {
      row = JSON.parse(jsonText);
    } catch (err) {
      throw new Error(`Invalid JSONL row at ${op.tableName}:${pk} (${err instanceof Error ? err.message : String(err)})`);
    }

    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw new Error(`JSONL row must be an object at ${op.tableName}:${pk}`);
    }

    const pkKey = table.primaryKey;
    const pkInRow = toPkString((row as any)[pkKey]);
    if (!pkInRow) throw new Error(`Row is missing primaryKey '${pkKey}' at ${op.tableName}:${pk}`);
    if (pkInRow !== pk) {
      throw new Error(`Row primaryKey mismatch at ${op.tableName}:${pk} (expected ${pk}, found ${pkInRow})`);
    }

    if (!(op.column in table.columns)) {
      throw new Error(`Unknown column '${op.column}' for table '${op.tableName}'`);
    }
    if (op.column === table.primaryKey) {
      throw new Error(`Editing primaryKey '${table.primaryKey}' is not supported by updateTableCell`);
    }

    const colType = table.columns[op.column]!;
    const nextValue = jsonCellValue(colType, op.value);

    const columnOrder = Object.keys(table.columns);
    const rowKeys = Object.keys(row as any);
    const extras = rowKeys.filter((k) => !columnOrder.includes(k));

    const keys: string[] = [];
    for (const k of columnOrder) {
      if (k === op.column || Object.prototype.hasOwnProperty.call(row, k)) keys.push(k);
    }
    for (const k of extras) keys.push(k);

    const nextRow: Record<string, unknown> = Object.create(null);
    for (const k of keys) {
      if (k === op.column) nextRow[k] = nextValue;
      else nextRow[k] = (row as any)[k];
    }

    lines[lineIdx] = `${indent}${JSON.stringify(nextRow)}${trailing}`;
    return lines.join(newline);
  }

  return source;
}

