/**
 * Purpose: Parse structured metadata keys from a CalcDown data block header.
 * Intent: Keep header parsing deterministic and diagnostics line-stable.
 */

import { parseType } from "./data_types.js";
import type { CalcdownMessage, FencedCodeBlock, InputType } from "./types.js";

export interface ParsedDataHeader {
  name: string | null;
  primaryKey: string | null;
  sortBy: string | null;
  sourceUri: string | null;
  sourceFormatRaw: string | null;
  sourceHash: string | null;
  columns: Record<string, InputType>;
}

export function parseDataHeaderLines(
  block: FencedCodeBlock,
  headerLines: string[]
): { header: ParsedDataHeader; messages: CalcdownMessage[] } {
  const messages: CalcdownMessage[] = [];
  let name: string | null = null;
  let primaryKey: string | null = null;
  let sortBy: string | null = null;
  let sourceUri: string | null = null;
  let sourceFormatRaw: string | null = null;
  let sourceHash: string | null = null;
  const columns: Record<string, InputType> = Object.create(null);

  for (let i = 0; i < headerLines.length; i++) {
    const raw = headerLines[i];
    if (raw === undefined) continue;
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const m = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/);
    if (!m) {
      messages.push({
        severity: "error",
        code: "CD_DATA_HEADER_INVALID_LINE",
        message: `Invalid data header line: ${trimmed}`,
        line: block.fenceLine + 1 + i,
        blockLang: block.lang,
      });
      continue;
    }

    const key = m[1]!;
    const value = m[2]!;

    if (key === "name") {
      name = value.trim() || null;
      continue;
    }
    if (key === "primaryKey") {
      primaryKey = value.trim() || null;
      continue;
    }
    if (key === "sortBy") {
      sortBy = value.trim() || null;
      continue;
    }
    if (key === "source") {
      sourceUri = value.trim() || null;
      continue;
    }
    if (key === "format") {
      sourceFormatRaw = value.trim() || null;
      continue;
    }
    if (key === "hash") {
      sourceHash = value.trim() || null;
      continue;
    }
    if (key === "columns") {
      for (i = i + 1; i < headerLines.length; i++) {
        const rawCol = headerLines[i];
        if (rawCol === undefined) continue;
        const trimmedCol = rawCol.trim();
        if (!trimmedCol || trimmedCol.startsWith("#")) continue;
        if (!rawCol.startsWith(" ") && !rawCol.startsWith("\t")) {
          i = i - 1;
          break;
        }
        const cm = trimmedCol.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.+)$/);
        if (!cm) {
          messages.push({
            severity: "error",
            code: "CD_DATA_COLUMNS_INVALID_ENTRY",
            message: `Invalid columns entry: ${trimmedCol}`,
            line: block.fenceLine + 1 + i,
            blockLang: block.lang,
          });
          continue;
        }
        const colName = cm[1]!;
        const typeRaw = cm[2]!;
        columns[colName] = parseType(typeRaw);
      }
      continue;
    }

    messages.push({
      severity: "warning",
      code: "CD_DATA_HEADER_UNKNOWN_KEY",
      message: `Unknown data header key: ${key}`,
      line: block.fenceLine + 1 + i,
      blockLang: block.lang,
    });
  }

  return {
    header: { name, primaryKey, sortBy, sourceUri, sourceFormatRaw, sourceHash, columns },
    messages,
  };
}
