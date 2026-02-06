/**
 * Purpose: Parse and apply calc-table patch statements.
 * Intent: Isolate patch semantics while keeping diagnostics stable.
 */

import type { Expr } from "./calcscript/ast.js";
import { calcErrorCodeForMessage, evaluateExpression } from "./calcscript/eval.js";
import { parseExpression } from "./calcscript/parser.js";
import { CalcScriptSyntaxError } from "./calcscript/tokenizer.js";
import { coerceTableCellValue, toPkString } from "./program_values.js";
import type { CalcdownMessage, DataTable, FencedCodeBlock } from "./types.js";

const bannedKeys = new Set(["__proto__", "prototype", "constructor"]);

export type TablePatchSelector = { kind: "index"; index1: number } | { kind: "primaryKey"; value: string };

export interface TablePatch {
  tableName: string;
  selector: TablePatchSelector;
  column: string;
  expr: Expr;
  line: number;
}

function parsePatchSelector(text: string): TablePatchSelector | null {
  const t = text.trim();

  if (/^[0-9]+$/.test(t)) {
    const n = Number(t);
    if (!Number.isFinite(n) || n < 1) return null;
    return { kind: "index", index1: Math.trunc(n) };
  }

  if (t.startsWith('"') && t.endsWith('"')) {
    try {
      const v = JSON.parse(t) as unknown;
      return typeof v === "string" ? { kind: "primaryKey", value: v } : null;
    } catch {
      return null;
    }
  }

  if (t.startsWith("'") && t.endsWith("'") && t.length >= 2) {
    return { kind: "primaryKey", value: t.slice(1, -1) };
  }

  return null;
}

export function parseTablePatchesFromCalcBlock(
  block: FencedCodeBlock
): { patches: TablePatch[]; messages: CalcdownMessage[] } {
  const patches: TablePatch[] = [];
  const messages: CalcdownMessage[] = [];

  // `<table>[<row>].<col> = <expr>;` where <row> is either:
  // - 1-based integer index, or
  // - JSON string literal primaryKey (recommended): "some pk"
  const patchRe =
    /^([A-Za-z_][A-Za-z0-9_]*)\s*\[\s*([^\]]+)\s*\]\s*\.\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)\s*;\s*$/;

  const lines = block.content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i] ?? "";
    const trimmed = rawLine.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("//")) continue;

    const m = trimmed.match(patchRe);
    if (!m) continue;

    const tableName = m[1] ?? "";
    const selectorText = m[2] ?? "";
    const column = m[3] ?? "";
    const exprText = (m[4] ?? "").trim();
    const lineNumber = block.fenceLine + 1 + i;

    const selector = parsePatchSelector(selectorText);
    if (!selector) {
      messages.push({
        severity: "error",
        code: "CD_CALC_PATCH_INVALID_SELECTOR",
        message: `Invalid table patch selector: [${selectorText.trim()}]`,
        line: lineNumber,
        blockLang: "calc",
        nodeName: `${tableName}[${selectorText.trim()}].${column}`,
      });
      continue;
    }

    let expr: Expr;
    try {
      expr = parseExpression(exprText);
    } catch (err) {
      const eqIdx = rawLine.indexOf("=");
      const afterEq = eqIdx === -1 ? "" : rawLine.slice(eqIdx + 1);
      const ws = afterEq.match(/^\s*/)?.[0] ?? "";
      const exprStartOffset = eqIdx === -1 ? 0 : eqIdx + 1 + ws.length;
      const exprStartCol = exprStartOffset + 1;
      const columnNumber =
        err instanceof CalcScriptSyntaxError ? exprStartCol + err.pos : exprStartCol;

      messages.push({
        severity: "error",
        code: "CD_CALC_PATCH_PARSE_EXPR",
        message: err instanceof Error ? err.message : String(err),
        line: lineNumber,
        column: columnNumber,
        blockLang: "calc",
        nodeName: `${tableName}[${selectorText.trim()}].${column}`,
      });
      continue;
    }

    patches.push({ tableName, selector, column, expr, line: lineNumber });
  }

  return { patches, messages };
}

export function collectTablePatches(
  blocks: FencedCodeBlock[]
): { patches: TablePatch[]; messages: CalcdownMessage[] } {
  const patches: TablePatch[] = [];
  const messages: CalcdownMessage[] = [];
  for (const block of blocks) {
    if (block.lang !== "calc") continue;
    const parsed = parseTablePatchesFromCalcBlock(block);
    patches.push(...parsed.patches);
    messages.push(...parsed.messages);
  }
  return { patches, messages };
}

interface ApplyTablePatchesParams {
  patches: TablePatch[];
  schemas: DataTable[];
  tables: Record<string, unknown>;
  env: Record<string, unknown>;
  std: unknown;
  tablePkByArray: WeakMap<object, { primaryKey: string }>;
}

export function applyTablePatches(params: ApplyTablePatchesParams): CalcdownMessage[] {
  const { patches, schemas, tables, env, std, tablePkByArray } = params;
  const messages: CalcdownMessage[] = [];

  const schemaByName = new Map<string, DataTable>();
  for (const t of schemas) schemaByName.set(t.name, t);

  const warnedPositional = new Set<string>();

  for (const p of patches) {
    const schema = schemaByName.get(p.tableName);
    if (!schema) {
      messages.push({
        severity: "error",
        code: "CD_CALC_PATCH_UNKNOWN_TABLE",
        message: `Table patch target does not exist: ${p.tableName}`,
        line: p.line,
        blockLang: "calc",
        nodeName: p.tableName,
      });
      continue;
    }

    if (schema.source) {
      messages.push({
        severity: "error",
        code: "CD_CALC_PATCH_EXTERNAL_TABLE",
        message: `External data tables are read-only and cannot be patched: ${p.tableName}`,
        line: p.line,
        blockLang: "calc",
        nodeName: p.tableName,
      });
      continue;
    }

    if (bannedKeys.has(p.column)) {
      messages.push({
        severity: "error",
        code: "CD_CALC_PATCH_DISALLOWED_KEY",
        message: `Disallowed column key in patch: ${p.column}`,
        line: p.line,
        blockLang: "calc",
        nodeName: `${p.tableName}.${p.column}`,
      });
      continue;
    }

    if (!(p.column in schema.columns)) {
      messages.push({
        severity: "error",
        code: "CD_CALC_PATCH_UNKNOWN_COLUMN",
        message: `Unknown column '${p.column}' for table '${p.tableName}'`,
        line: p.line,
        blockLang: "calc",
        nodeName: `${p.tableName}.${p.column}`,
      });
      continue;
    }
    if (p.column === schema.primaryKey) {
      messages.push({
        severity: "error",
        code: "CD_CALC_PATCH_PRIMARYKEY",
        message: `Patching primaryKey '${schema.primaryKey}' is not supported`,
        line: p.line,
        blockLang: "calc",
        nodeName: `${p.tableName}.${p.column}`,
      });
      continue;
    }

    const rows = tables[p.tableName];
    if (!Array.isArray(rows)) {
      messages.push({
        severity: "error",
        code: "CD_CALC_PATCH_TARGET_NOT_TABLE",
        message: `Patch target is not a table: ${p.tableName}`,
        line: p.line,
        blockLang: "calc",
        nodeName: p.tableName,
      });
      continue;
    }

    let rowIndex = -1;
    if (p.selector.kind === "index") {
      if (!warnedPositional.has(p.tableName)) {
        warnedPositional.add(p.tableName);
        messages.push({
          severity: "warning",
          code: "CD_CALC_PATCH_POSITIONAL",
          message: `Table patches by row index are fragile; prefer primaryKey selectors like ${p.tableName}["..."]`,
          line: p.line,
          blockLang: "calc",
          nodeName: p.tableName,
        });
      }
      rowIndex = p.selector.index1 - 1;
    } else {
      const pkKey = schema.primaryKey;
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        if (!r || typeof r !== "object" || Array.isArray(r)) continue;
        const pk = toPkString((r as Record<string, unknown>)[pkKey]);
        if (pk === p.selector.value) {
          rowIndex = i;
          break;
        }
      }
    }

    if (rowIndex < 0 || rowIndex >= rows.length) {
      const selectorText = p.selector.kind === "index" ? String(p.selector.index1) : JSON.stringify(p.selector.value);
      messages.push({
        severity: "error",
        code: "CD_CALC_PATCH_ROW_NOT_FOUND",
        message: `Row not found for patch: ${p.tableName}[${selectorText}]`,
        line: p.line,
        blockLang: "calc",
        nodeName: `${p.tableName}[${selectorText}].${p.column}`,
      });
      continue;
    }

    const row = rows[rowIndex];
    if (!row || typeof row !== "object" || Array.isArray(row) || row instanceof Date) {
      messages.push({
        severity: "error",
        code: "CD_CALC_PATCH_ROW_INVALID",
        message: `Target row is not an object for patch: ${p.tableName}`,
        line: p.line,
        blockLang: "calc",
        nodeName: p.tableName,
      });
      continue;
    }

    let computed: unknown;
    try {
      computed = evaluateExpression(p.expr, env, std, tablePkByArray);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const selectorText = p.selector.kind === "index" ? String(p.selector.index1) : JSON.stringify(p.selector.value);
      messages.push({
        severity: "error",
        code: calcErrorCodeForMessage(msg),
        message: msg,
        line: p.line,
        blockLang: "calc",
        nodeName: `${p.tableName}[${selectorText}].${p.column}`,
      });
      continue;
    }

    let nextValue: unknown;
    try {
      nextValue = coerceTableCellValue(schema.columns[p.column]!, computed);
    } catch (err) {
      const selectorText = p.selector.kind === "index" ? String(p.selector.index1) : JSON.stringify(p.selector.value);
      messages.push({
        severity: "error",
        code: "CD_CALC_PATCH_TYPE",
        message: err instanceof Error ? err.message : String(err),
        line: p.line,
        blockLang: "calc",
        nodeName: `${p.tableName}[${selectorText}].${p.column}`,
      });
      continue;
    }

    const nextRow: Record<string, unknown> = Object.create(null);
    for (const k of Object.keys(row as Record<string, unknown>)) nextRow[k] = (row as Record<string, unknown>)[k];
    nextRow[p.column] = nextValue;
    rows[rowIndex] = nextRow;
  }

  return messages;
}
