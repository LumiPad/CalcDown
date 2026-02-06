/**
 * Purpose: Parse CalcDown data blocks into validated table definitions.
 * Intent: Preserve stable diagnostics while delegating header and row helpers.
 */

import { parseDataHeaderLines } from "./data_header.js";
import { parseInlineJsonlRows } from "./data_rows.js";
import { isIdent } from "./data_types.js";
import type { CalcdownMessage, DataTable, FencedCodeBlock } from "./types.js";

export function parseDataBlock(block: FencedCodeBlock): { table: DataTable | null; messages: CalcdownMessage[] } {
  const messages: CalcdownMessage[] = [];
  const lines = block.content.split(/\r?\n/);

  const sepIdx = lines.findIndex((l) => (l ?? "").trim() === "---");
  if (sepIdx === -1) {
    messages.push({
      severity: "error",
      code: "CD_DATA_MISSING_SEPARATOR",
      message: "Data block is missing '---' separator between header and rows",
      line: block.fenceLine + 1,
      blockLang: block.lang,
    });
    return { table: null, messages };
  }

  const headerLines = lines.slice(0, sepIdx);
  const rowLines = lines.slice(sepIdx + 1);
  const parsedHeader = parseDataHeaderLines(block, headerLines);
  messages.push(...parsedHeader.messages);

  const { name, primaryKey, sortBy, sourceUri, sourceFormatRaw, sourceHash, columns } = parsedHeader.header;

  if (!name) {
    messages.push({
      severity: "error",
      code: "CD_DATA_HEADER_MISSING_NAME",
      message: "Data header is missing required key: name",
      line: block.fenceLine + 1,
      blockLang: block.lang,
    });
  } else if (!isIdent(name)) {
    messages.push({
      severity: "error",
      code: "CD_DATA_INVALID_NAME",
      message: `Invalid table name: ${name}`,
      line: block.fenceLine + 1,
      blockLang: block.lang,
      nodeName: name,
    });
  } else if (name === "std") {
    messages.push({
      severity: "error",
      code: "CD_DATA_RESERVED_NAME",
      message: "The identifier 'std' is reserved and cannot be used as a table name",
      line: block.fenceLine + 1,
      blockLang: block.lang,
      nodeName: name,
    });
  }

  if (!primaryKey) {
    messages.push({
      severity: "error",
      code: "CD_DATA_HEADER_MISSING_PRIMARY_KEY",
      message: "Data header is missing required key: primaryKey",
      line: block.fenceLine + 1,
      blockLang: block.lang,
    });
  }

  if (Object.keys(columns).length === 0) {
    messages.push({
      severity: "error",
      code: "CD_DATA_HEADER_MISSING_COLUMNS",
      message: "Data header is missing required key: columns",
      line: block.fenceLine + 1,
      blockLang: block.lang,
    });
  } else if (primaryKey && !(primaryKey in columns)) {
    messages.push({
      severity: "error",
      code: "CD_DATA_PRIMARYKEY_NOT_DECLARED",
      message: `primaryKey '${primaryKey}' must be declared in columns`,
      line: block.fenceLine + 1,
      blockLang: block.lang,
      nodeName: primaryKey,
    });
  }

  if (sortBy !== null && sortBy !== "" && !isIdent(sortBy)) {
    messages.push({
      severity: "error",
      code: "CD_DATA_SORTBY_INVALID",
      message: `Invalid sortBy column name: ${sortBy}`,
      line: block.fenceLine + 1,
      blockLang: block.lang,
      nodeName: sortBy,
    });
  } else if (sortBy && Object.keys(columns).length > 0 && !(sortBy in columns)) {
    messages.push({
      severity: "warning",
      code: "CD_DATA_SORTBY_UNKNOWN",
      message: `sortBy column '${sortBy}' is not declared in columns`,
      line: block.fenceLine + 1,
      blockLang: block.lang,
      nodeName: sortBy,
    });
  }

  const tableName = name;
  const pk = primaryKey;
  if (!tableName || !pk || Object.keys(columns).length === 0 || !isIdent(tableName) || tableName === "std") {
    return { table: null, messages };
  }

  let source: DataTable["source"] | undefined;
  if (sourceUri) {
    const formatText = sourceFormatRaw ? sourceFormatRaw.toLowerCase() : "";
    let format: "csv" | "json" | null = null;
    if (formatText === "csv") format = "csv";
    else if (formatText === "json") format = "json";
    else if (!formatText) {
      const lower = sourceUri.toLowerCase();
      if (lower.endsWith(".csv")) format = "csv";
      else if (lower.endsWith(".json") || lower.endsWith(".jsonl")) format = "json";
    }

    if (!format) {
      messages.push({
        severity: "error",
        code: "CD_DATA_EXTERNAL_FORMAT",
        message: "External data tables must specify format: csv|json (or use a .csv/.json extension)",
        line: block.fenceLine + 1,
        blockLang: block.lang,
        nodeName: tableName,
      });
    }

    if (!sourceHash) {
      messages.push({
        severity: "error",
        code: "CD_DATA_EXTERNAL_MISSING_HASH",
        message: "External data tables must specify hash: sha256:<hex>",
        line: block.fenceLine + 1,
        blockLang: block.lang,
        nodeName: tableName,
      });
    } else if (!/^sha256:[0-9a-fA-F]{64}$/.test(sourceHash)) {
      messages.push({
        severity: "error",
        code: "CD_DATA_EXTERNAL_INVALID_HASH",
        message: "Invalid hash format (expected sha256:<64 hex chars>)",
        line: block.fenceLine + 1,
        blockLang: block.lang,
        nodeName: tableName,
      });
    }

    for (let i = 0; i < rowLines.length; i++) {
      const raw = rowLines[i] ?? "";
      const trimmed = raw.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      messages.push({
        severity: "error",
        code: "CD_DATA_EXTERNAL_INLINE_ROWS",
        message: "External data tables must not include inline JSONL rows",
        line: block.fenceLine + 1 + sepIdx + 1 + i,
        blockLang: block.lang,
        nodeName: tableName,
      });
      break;
    }

    if (format && sourceHash) {
      source = { uri: sourceUri, format, hash: sourceHash };
    }
  } else {
    if (sourceFormatRaw) {
      messages.push({
        severity: "warning",
        code: "CD_DATA_UNUSED_FORMAT",
        message: "Ignoring data header key 'format' without 'source'",
        line: block.fenceLine + 1,
        blockLang: block.lang,
        nodeName: tableName,
      });
    }
    if (sourceHash) {
      messages.push({
        severity: "warning",
        code: "CD_DATA_UNUSED_HASH",
        message: "Ignoring data header key 'hash' without 'source'",
        line: block.fenceLine + 1,
        blockLang: block.lang,
        nodeName: tableName,
      });
    }
  }

  let rows: Record<string, unknown>[] = [];
  let rowMap: { primaryKey: string; line: number }[] = [];
  if (!sourceUri) {
    const parsedRows = parseInlineJsonlRows({
      tableName,
      primaryKey: pk,
      columns,
      rowLines,
      fenceLine: block.fenceLine,
      separatorLineIndex: sepIdx,
      blockLang: block.lang,
    });
    messages.push(...parsedRows.messages);
    rows = parsedRows.rows;
    rowMap = parsedRows.rowMap;
  }

  const table: DataTable = {
    name: tableName,
    primaryKey: pk,
    columns,
    rows,
    ...(!sourceUri ? { rowMap } : {}),
    ...(source ? { source } : {}),
    ...(sortBy ? { sortBy } : {}),
    line: block.fenceLine + 1,
  };

  return { table, messages };
}
