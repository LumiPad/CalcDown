/**
 * Purpose: Parse and coerce data rows for inline JSONL and external tables.
 * Intent: Reuse row validation rules while preserving source-specific diagnostics.
 */

import { parseScalarByType } from "./data_types.js";
import type { CalcdownMessage, DataRowMapEntry, InputType } from "./types.js";

function toPrimaryKeyString(value: unknown): string | null {
  return typeof value === "string" ? value : typeof value === "number" ? String(value) : null;
}

function coerceRowValues(
  tableName: string,
  line: number,
  blockLang: string,
  columns: Record<string, InputType>,
  sourceRow: Record<string, unknown>,
  messages: CalcdownMessage[],
  file?: string
): Record<string, unknown> {
  const row: Record<string, unknown> = Object.create(null);
  for (const [k, v] of Object.entries(sourceRow)) {
    if (k in columns) {
      try {
        row[k] = parseScalarByType(columns[k]!, v);
      } catch (err) {
        messages.push({
          severity: "error",
          code: "CD_DATA_INVALID_VALUE",
          message: `Invalid value for column '${k}': ${err instanceof Error ? err.message : String(err)}`,
          ...(file ? { file } : {}),
          line,
          blockLang,
          nodeName: tableName,
        });
        row[k] = v;
      }
    } else {
      row[k] = v;
    }
  }
  return row;
}

export function coerceRowsToTable(
  tableName: string,
  primaryKey: string,
  columns: Record<string, InputType>,
  rawRows: unknown[],
  opts: { baseLine: number; blockLang: string; file?: string }
): { rows: Record<string, unknown>[]; messages: CalcdownMessage[] } {
  const messages: CalcdownMessage[] = [];
  const seenKeys = new Set<string>();
  const rows: Record<string, unknown>[] = [];

  const baseLine = opts.baseLine;
  const blockLang = opts.blockLang;
  const file = opts.file;

  for (let i = 0; i < rawRows.length; i++) {
    const parsed = rawRows[i];
    const line = baseLine + i;

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      messages.push({
        severity: "error",
        code: "CD_DATA_ROW_NOT_OBJECT",
        message: "Data row must be an object",
        ...(file ? { file } : {}),
        line,
        blockLang,
        nodeName: tableName,
      });
      continue;
    }

    const obj = parsed as Record<string, unknown>;
    if (!Object.prototype.hasOwnProperty.call(obj, primaryKey)) {
      messages.push({
        severity: "error",
        code: "CD_DATA_ROW_MISSING_PK",
        message: `Data row is missing primaryKey '${primaryKey}'`,
        ...(file ? { file } : {}),
        line,
        blockLang,
        nodeName: tableName,
      });
      continue;
    }

    const pkString = toPrimaryKeyString(obj[primaryKey]);
    if (!pkString) {
      messages.push({
        severity: "error",
        code: "CD_DATA_PK_TYPE",
        message: `primaryKey '${primaryKey}' must be a string or number`,
        ...(file ? { file } : {}),
        line,
        blockLang,
        nodeName: tableName,
      });
      continue;
    }
    if (seenKeys.has(pkString)) {
      messages.push({
        severity: "error",
        code: "CD_DATA_PK_DUPLICATE",
        message: `Duplicate primaryKey '${pkString}'`,
        ...(file ? { file } : {}),
        line,
        blockLang,
        nodeName: tableName,
      });
      continue;
    }
    seenKeys.add(pkString);
    rows.push(coerceRowValues(tableName, line, blockLang, columns, obj, messages, file));
  }

  return { rows, messages };
}

interface ParseInlineRowsParams {
  tableName: string;
  primaryKey: string;
  columns: Record<string, InputType>;
  rowLines: string[];
  fenceLine: number;
  separatorLineIndex: number;
  blockLang: string;
}

export function parseInlineJsonlRows(
  params: ParseInlineRowsParams
): { rows: Record<string, unknown>[]; rowMap: DataRowMapEntry[]; messages: CalcdownMessage[] } {
  const { tableName, primaryKey, columns, rowLines, fenceLine, separatorLineIndex, blockLang } = params;
  const messages: CalcdownMessage[] = [];
  const seenKeys = new Set<string>();
  const rows: Record<string, unknown>[] = [];
  const rowMap: DataRowMapEntry[] = [];

  for (let i = 0; i < rowLines.length; i++) {
    const raw = rowLines[i] ?? "";
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const line = fenceLine + 1 + separatorLineIndex + 1 + i;

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch (err) {
      messages.push({
        severity: "error",
        code: "CD_DATA_ROW_INVALID_JSON",
        message: err instanceof Error ? err.message : "Invalid JSON row",
        line,
        blockLang,
        nodeName: tableName,
      });
      continue;
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      messages.push({
        severity: "error",
        code: "CD_DATA_ROW_NOT_OBJECT",
        message: "Data row must be a JSON object",
        line,
        blockLang,
        nodeName: tableName,
      });
      continue;
    }

    const obj = parsed as Record<string, unknown>;
    if (!Object.prototype.hasOwnProperty.call(obj, primaryKey)) {
      messages.push({
        severity: "error",
        code: "CD_DATA_ROW_MISSING_PK",
        message: `Data row is missing primaryKey '${primaryKey}'`,
        line,
        blockLang,
        nodeName: tableName,
      });
      continue;
    }

    const pkString = toPrimaryKeyString(obj[primaryKey]);
    if (!pkString) {
      messages.push({
        severity: "error",
        code: "CD_DATA_PK_TYPE",
        message: `primaryKey '${primaryKey}' must be a string or number`,
        line,
        blockLang,
        nodeName: tableName,
      });
      continue;
    }
    if (seenKeys.has(pkString)) {
      messages.push({
        severity: "error",
        code: "CD_DATA_PK_DUPLICATE",
        message: `Duplicate primaryKey '${pkString}'`,
        line,
        blockLang,
        nodeName: tableName,
      });
      continue;
    }
    seenKeys.add(pkString);

    rows.push(coerceRowValues(tableName, line, blockLang, columns, obj, messages));
    rowMap.push({ primaryKey: pkString, line });
  }

  return { rows, rowMap, messages };
}
