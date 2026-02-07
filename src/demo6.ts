/**
 * Purpose: Run demo6 showing CalcDown 1.0 notebooks inside `.md` with explicit fences.
 * Intent: Demonstrate `calcdown <kind>` / `calcdown:<kind>` blocks coexisting with other Markdown fences.
 */

import { evaluateProgram, parseProgram } from "./index.js";
import { inferCalcdownTypes } from "./infer_types.js";
import { applyPatch, buildSourceMap, type PatchOp } from "./editor/patcher.js";
import type { DataTable } from "./types.js";
import type { CalcdownMessage } from "./types.js";
import type { CalcdownView } from "./view_contract.js";
import { validateViewsFromBlocks } from "./view_contract.js";
import { byId, createDebouncer, installCalcdownStyles } from "./web/index.js";
import { renderCalcdownDocument, updateCalcdownDocumentViews, type CalcdownDocumentState } from "./web/render_document.js";

type FenceMode = "implicit" | "explicit";

type RunResult = {
  program: ReturnType<typeof parseProgram>["program"];
  values: Record<string, unknown>;
  views: CalcdownView[];
  parseMessages: CalcdownMessage[];
  evalMessages: CalcdownMessage[];
  viewMessages: CalcdownMessage[];
};

const run = byId("run", HTMLButtonElement, "run button");
const live = byId("live", HTMLInputElement, "live checkbox");
const fenceModeSelect = byId("fenceMode", HTMLSelectElement, "fenceMode select");
const previewRoot = byId("preview", HTMLDivElement, "preview div");
const messages = byId("messages", HTMLPreElement, "messages pre");
const source = byId("source", HTMLTextAreaElement, "source textarea");

const debouncer = createDebouncer(500);
installCalcdownStyles();

type TableSchemas = Record<string, DataTable>;
let tableSchemas: TableSchemas = Object.create(null);
let editMessages: CalcdownMessage[] = [];
let docState: CalcdownDocumentState | null = null;
let valueTypes: ReturnType<typeof inferCalcdownTypes>["valueTypes"] = Object.create(null);

const docRoot = document.createElement("div");
docRoot.className = "calcdown-root";

const docEl = document.createElement("div");
docEl.className = "calcdown-doc";
docRoot.appendChild(docEl);
previewRoot.appendChild(docRoot);

function readFenceMode(): FenceMode {
  const v = fenceModeSelect.value;
  return v === "explicit" ? "explicit" : "implicit";
}

function parseWithFenceMode(markdown: string, fenceMode: FenceMode): ReturnType<typeof parseProgram> {
  return parseProgram(markdown, { fenceMode });
}

function validateViewSources(program: RunResult["program"], views: CalcdownView[]): CalcdownMessage[] {
  const known = new Set<string>();
  for (const t of program.tables) known.add(t.name);
  for (const n of program.nodes) known.add(n.name);

  const messages: CalcdownMessage[] = [];
  for (const v of views) {
    if (v.type !== "table" && v.type !== "chart") continue;
    const src = v.source;
    if (!known.has(src)) {
      messages.push({
        severity: "error",
        code: "CD_VIEW_UNKNOWN_SOURCE",
        message: `View source does not exist: ${src}`,
        line: v.line,
        blockLang: "view",
        nodeName: v.id,
      });
    }
  }
  return messages;
}

function runCalcdownDoc(markdown: string, fenceMode: FenceMode): RunResult {
  const parsed = parseWithFenceMode(markdown, fenceMode);
  const evaluated = evaluateProgram(parsed.program, {}, {});

  const validated = validateViewsFromBlocks(parsed.program.blocks);
  const viewMessages: CalcdownMessage[] = [...validated.messages, ...validateViewSources(parsed.program, validated.views)];

  return {
    program: parsed.program,
    values: evaluated.values,
    views: validated.views,
    parseMessages: parsed.messages,
    evalMessages: evaluated.messages,
    viewMessages,
  };
}

function resetSchemasFromProgram(programTables: DataTable[], computedTables: Record<string, DataTable>): void {
  tableSchemas = Object.create(null);
  for (const t of programTables) tableSchemas[t.name] = t;
  for (const [k, schema] of Object.entries(computedTables)) tableSchemas[k] = schema;
}

function renderMessages(opts: {
  fenceMode: FenceMode;
  parseMessages: CalcdownMessage[];
  evalMessages: CalcdownMessage[];
  viewMessages: CalcdownMessage[];
}): void {
  messages.textContent = JSON.stringify(
    {
      fenceMode: opts.fenceMode,
      parseMessages: opts.parseMessages,
      evalMessages: opts.evalMessages,
      viewMessages: opts.viewMessages,
      editMessages,
    },
    null,
    2
  );
}

function applyEditorPatch(op: PatchOp, fenceMode: FenceMode): void {
  editMessages = [];
  const parsed = parseWithFenceMode(source.value, fenceMode);
  const map = buildSourceMap(parsed.program);
  try {
    source.value = applyPatch(source.value, op, map);
  } catch (err) {
    editMessages.push({
      severity: "error",
      code: "CD_EDITOR_PATCH",
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

function scheduleRecompute(): void {
  if (!live.checked) return;
  debouncer.schedule(recomputeViewsOnly);
}

function buildDocument(): void {
  const fenceMode = readFenceMode();
  const res = runCalcdownDoc(source.value, fenceMode);
  const inferred = inferCalcdownTypes(res.program);
  valueTypes = inferred.valueTypes;
  resetSchemasFromProgram(res.program.tables, inferred.computedTables);

  docState = renderCalcdownDocument({
    container: docEl,
    markdown: source.value,
    run: res,
    tableSchemas,
    valueTypes,
    onInputChange: (ev) => {
      applyEditorPatch({ kind: "updateInput", name: ev.name, value: ev.value }, fenceMode);
      scheduleRecompute();
    },
    onEditTableCell: (ev) => {
      if (!ev.primaryKey) return;
      applyEditorPatch(
        {
          kind: "updateTableCell",
          tableName: ev.tableName,
          primaryKey: ev.primaryKey,
          column: ev.column,
          value: ev.value,
        },
        fenceMode
      );
      scheduleRecompute();
    },
  });

  renderMessages({ fenceMode, parseMessages: res.parseMessages, evalMessages: res.evalMessages, viewMessages: res.viewMessages });
}

function recomputeViewsOnly(): void {
  const fenceMode = readFenceMode();
  const res = runCalcdownDoc(source.value, fenceMode);
  const inferred = inferCalcdownTypes(res.program);
  valueTypes = inferred.valueTypes;
  resetSchemasFromProgram(res.program.tables, inferred.computedTables);

  if (!docState) {
    buildDocument();
    return;
  }

  updateCalcdownDocumentViews(docState, res, {
    tableSchemas,
    valueTypes,
    onEditTableCell: (ev) => {
      if (!ev.primaryKey) return;
      applyEditorPatch(
        {
          kind: "updateTableCell",
          tableName: ev.tableName,
          primaryKey: ev.primaryKey,
          column: ev.column,
          value: ev.value,
        },
        fenceMode
      );
      scheduleRecompute();
    },
  });

  renderMessages({ fenceMode, parseMessages: res.parseMessages, evalMessages: res.evalMessages, viewMessages: res.viewMessages });
}

async function loadDefault(): Promise<void> {
  const res = await fetch(new URL("../docs/examples/notebook.md", import.meta.url), { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  source.value = await res.text();
}

run.addEventListener("click", () => {
  debouncer.cancel();
  buildDocument();
});

live.addEventListener("change", () => {
  if (live.checked) scheduleRecompute();
});

fenceModeSelect.addEventListener("change", () => {
  debouncer.cancel();
  buildDocument();
});

source.addEventListener("input", () => {
  if (!live.checked) return;
  debouncer.schedule(() => buildDocument());
});

await loadDefault();
buildDocument();

