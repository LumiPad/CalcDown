/**
 * Purpose: Parse CalcDown markdown blocks into a validated program graph.
 * Intent: Enforce naming rules and collect deterministic parser diagnostics.
 */

import { compileCalcScript, type CalcNode } from "./calcscript/compile.js";
import { parseDataBlock } from "./data.js";
import { parseInputsBlock } from "./inputs.js";
import { isCalcdownFenceMarkerInfo, parseCalcdownMarkdown } from "./markdown.js";
import type { CalcdownProgram } from "./program_types.js";
import type { CalcdownMessage, DataTable, InputDefinition } from "./types.js";

export type ParseProgramFenceMode = "implicit" | "explicit";

export interface ParseProgramOptions {
  /**
   * - `implicit` (default): treat `inputs|data|calc|view` fences as CalcDown blocks.
   * - `explicit`: treat only `calcdown <kind>` / `calcdown:<kind>` fences as CalcDown blocks.
   */
  fenceMode?: ParseProgramFenceMode;
}

export function parseProgram(markdown: string, opts: ParseProgramOptions = {}): { program: CalcdownProgram; messages: CalcdownMessage[] } {
  const messages: CalcdownMessage[] = [];
  const parsed = parseCalcdownMarkdown(markdown);
  const fenceMode: ParseProgramFenceMode = opts.fenceMode ?? "implicit";

  const inputs: InputDefinition[] = [];
  const tables: DataTable[] = [];
  const nodes: CalcNode[] = [];

  const seenInputs = new Set<string>();
  const seenTables = new Set<string>();
  const seenNodes = new Set<string>();
  const allowedBlockLangs = new Set(["inputs", "data", "calc", "view"]);
  const suspiciousLangs = new Set(["input", "views", "datas", "calcs"]);

  const blocks = parsed.codeBlocks.map((block) => {
    if (fenceMode !== "explicit") return block;
    if (isCalcdownFenceMarkerInfo(block.info)) return block;
    if (allowedBlockLangs.has(block.lang)) {
      return Object.assign(Object.create(null), block, { lang: "" });
    }
    return block;
  });

  for (const block of blocks) {
    if (!allowedBlockLangs.has(block.lang)) {
      if (block.lang === "calcdown") {
        const tokens = block.info.trim().split(/\s+/).filter(Boolean);
        const first = tokens[0] ?? "";
        let kind = "";
        if (first.toLowerCase() === "calcdown") {
          kind = (tokens[1] ?? "").trim();
        } else {
          const colonIdx = first.indexOf(":");
          if (colonIdx !== -1 && first.slice(0, colonIdx).toLowerCase() === "calcdown") {
            kind = first.slice(colonIdx + 1).trim();
          }
        }

        messages.push({
          severity: "error",
          code: kind ? "CD_BLOCK_CALCDOWN_UNKNOWN_KIND" : "CD_BLOCK_CALCDOWN_MISSING_KIND",
          message: kind
            ? `Unknown CalcDown block kind: ${kind}. Expected one of: inputs, data, calc, view.`
            : "CalcDown fenced code blocks using the 'calcdown' marker must include a kind: inputs, data, calc, or view.",
          line: block.fenceLine,
          blockLang: "calcdown",
        });
      } else if (block.lang && fenceMode !== "explicit") {
        const lower = block.lang.toLowerCase();
        if (suspiciousLangs.has(lower)) {
          const hint = lower === "input" ? "inputs" : lower.endsWith("s") ? lower.slice(0, -1) : "";
          messages.push({
            severity: "warning",
            code: "CD_BLOCK_SUSPECT_LANG",
            message: hint
              ? `Suspicious fenced code block language: ${block.lang}. Did you mean '${hint}'?`
              : `Suspicious fenced code block language: ${block.lang}.`,
            line: block.fenceLine,
            blockLang: block.lang,
          });
        }
      }

      // Non-CalcDown fences are allowed and ignored by the program parser.
      continue;
    }

    if (block.lang === "inputs") {
      const res = parseInputsBlock(block);
      messages.push(...res.messages);
      for (const input of res.inputs) {
        if (input.name === "std") {
          messages.push({
            severity: "error",
            code: "CD_NAME_RESERVED_STD",
            message: "The identifier 'std' is reserved and cannot be used as an input name",
            line: input.line,
            blockLang: block.lang,
            nodeName: input.name,
          });
          continue;
        }
        if (seenInputs.has(input.name)) {
          messages.push({
            severity: "error",
            code: "CD_INPUT_DUPLICATE_ACROSS_BLOCKS",
            message: `Duplicate input name across blocks: ${input.name}`,
            line: input.line,
            blockLang: block.lang,
            nodeName: input.name,
          });
          continue;
        }
        if (seenNodes.has(input.name)) {
          messages.push({
            severity: "error",
            code: "CD_NAME_CONFLICT_INPUT_NODE",
            message: `Name conflict: '${input.name}' is defined as both an input and a calc node`,
            line: input.line,
            blockLang: block.lang,
            nodeName: input.name,
          });
          continue;
        }
        if (seenTables.has(input.name)) {
          messages.push({
            severity: "error",
            code: "CD_NAME_CONFLICT_INPUT_TABLE",
            message: `Name conflict: '${input.name}' is defined as both an input and a data table`,
            line: input.line,
            blockLang: block.lang,
            nodeName: input.name,
          });
          continue;
        }
        seenInputs.add(input.name);
        inputs.push(input);
      }
    }

    if (block.lang === "data") {
      const res = parseDataBlock(block);
      messages.push(...res.messages);
      const table = res.table;
      if (!table) continue;

      if (seenTables.has(table.name)) {
        messages.push({
          severity: "error",
          code: "CD_DATA_DUPLICATE_TABLE_NAME",
          message: `Duplicate table name across data blocks: ${table.name}`,
          line: table.line,
          blockLang: block.lang,
          nodeName: table.name,
        });
        continue;
      }
      if (seenInputs.has(table.name)) {
        messages.push({
          severity: "error",
          code: "CD_NAME_CONFLICT_TABLE_INPUT",
          message: `Name conflict: '${table.name}' is defined as both a data table and an input`,
          line: table.line,
          blockLang: block.lang,
          nodeName: table.name,
        });
        continue;
      }
      if (seenNodes.has(table.name)) {
        messages.push({
          severity: "error",
          code: "CD_NAME_CONFLICT_TABLE_NODE",
          message: `Name conflict: '${table.name}' is defined as both a data table and a calc node`,
          line: table.line,
          blockLang: block.lang,
          nodeName: table.name,
        });
        continue;
      }

      seenTables.add(table.name);
      tables.push(table);
    }

    if (block.lang === "calc") {
      const baseLine = block.fenceLine + 1;
      const compiled = compileCalcScript(block.content, baseLine);
      messages.push(...compiled.messages.map((m) => ({ ...m, blockLang: "calc" as const })));
      for (const node of compiled.nodes) {
        if (node.name === "std") {
          messages.push({
            severity: "error",
            code: "CD_NAME_RESERVED_STD",
            message: "The identifier 'std' is reserved and cannot be used as a node name",
            line: node.line,
            blockLang: block.lang,
            nodeName: node.name,
          });
          continue;
        }
        if (seenNodes.has(node.name)) {
          messages.push({
            severity: "error",
            code: "CD_CALC_DUPLICATE_NODE_ACROSS_BLOCKS",
            message: `Duplicate node name across calc blocks: ${node.name}`,
            line: node.line,
            blockLang: block.lang,
            nodeName: node.name,
          });
          continue;
        }
        if (seenInputs.has(node.name)) {
          messages.push({
            severity: "error",
            code: "CD_NAME_CONFLICT_NODE_INPUT",
            message: `Name conflict: '${node.name}' is defined as both a calc node and an input`,
            line: node.line,
            blockLang: block.lang,
            nodeName: node.name,
          });
          continue;
        }
        if (seenTables.has(node.name)) {
          messages.push({
            severity: "error",
            code: "CD_NAME_CONFLICT_NODE_TABLE",
            message: `Name conflict: '${node.name}' is defined as both a calc node and a data table`,
            line: node.line,
            blockLang: block.lang,
            nodeName: node.name,
          });
          continue;
        }
        seenNodes.add(node.name);
        nodes.push(node);
      }
    }
  }

  return {
    program: {
      frontMatter: parsed.frontMatter,
      blocks,
      inputs,
      tables,
      nodes,
    },
    messages,
  };
}
