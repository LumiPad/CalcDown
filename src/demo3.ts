/**
 * Purpose: Run demo3 with editable table inputs and computed outputs.
 * Intent: Demonstrate table-driven modeling, views, and round-trip updates.
 */

import { parseProgram } from "./index.js";
import type { CalcdownMessage, DataTable } from "./types.js";
import { applyPatch, buildSourceMap, type PatchOp } from "./editor/patcher.js";
import { byId, createDebouncer, installCalcdownStyles, runCalcdown } from "./web/index.js";
import { renderCalcdownDocument, updateCalcdownDocumentViews, type CalcdownDocumentState } from "./web/render_document.js";
import { inferCalcdownTypes } from "./infer_types.js";

const run = byId("run", HTMLButtonElement, "run button");
const live = byId("live", HTMLInputElement, "live checkbox");
const viewsRoot = byId("views", HTMLDivElement, "views div");
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
viewsRoot.appendChild(docRoot);

function applyEditorPatch(op: PatchOp): void {
  editMessages = [];
  const parsed = parseProgram(source.value);
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

function resetSchemasFromProgram(parsedTables: DataTable[]): void {
  tableSchemas = Object.create(null);
  for (const t of parsedTables) tableSchemas[t.name] = t;
}

function renderMessages(opts: { parseMessages: CalcdownMessage[]; evalMessages: CalcdownMessage[]; viewMessages: CalcdownMessage[] }): void {
  messages.textContent = JSON.stringify(
    {
      parseMessages: opts.parseMessages,
      evalMessages: opts.evalMessages,
      viewMessages: opts.viewMessages,
      editMessages,
    },
    null,
    2
  );
}

function buildDocument(): void {
  const res = runCalcdown(source.value);
  const inferred = inferCalcdownTypes(res.program);
  valueTypes = inferred.valueTypes;
  resetSchemasFromProgram(res.program.tables);
  for (const [k, schema] of Object.entries(inferred.computedTables)) tableSchemas[k] = schema;

  docState = renderCalcdownDocument({
    container: docEl,
    markdown: source.value,
    run: res,
    tableSchemas,
    valueTypes,
    onInputChange: (ev) => {
      applyEditorPatch({ kind: "updateInput", name: ev.name, value: ev.value });
      scheduleRecompute();
    },
    onEditTableCell: (ev) => {
      if (!ev.primaryKey) return;
      applyEditorPatch({
        kind: "updateTableCell",
        tableName: ev.tableName,
        primaryKey: ev.primaryKey,
        column: ev.column,
        value: ev.value,
      });
      scheduleRecompute();
    },
  });

  renderMessages({ parseMessages: res.parseMessages, evalMessages: res.evalMessages, viewMessages: res.viewMessages });
}

function recomputeViewsOnly(): void {
  const res = runCalcdown(source.value);
  const inferred = inferCalcdownTypes(res.program);
  valueTypes = inferred.valueTypes;
  resetSchemasFromProgram(res.program.tables);
  for (const [k, schema] of Object.entries(inferred.computedTables)) tableSchemas[k] = schema;

  if (!docState) {
    buildDocument();
    return;
  }

  updateCalcdownDocumentViews(docState, res, {
    tableSchemas,
    valueTypes,
    onEditTableCell: (ev) => {
      if (!ev.primaryKey) return;
      applyEditorPatch({
        kind: "updateTableCell",
        tableName: ev.tableName,
        primaryKey: ev.primaryKey,
        column: ev.column,
        value: ev.value,
      });
      scheduleRecompute();
    },
  });

  renderMessages({ parseMessages: res.parseMessages, evalMessages: res.evalMessages, viewMessages: res.viewMessages });
}

async function loadDefault(): Promise<void> {
  const res = await fetch(new URL("../docs/examples/invoice.calc.md", import.meta.url), { cache: "no-store" });
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

source.addEventListener("input", () => {
  if (!live.checked) return;
  debouncer.schedule(() => {
    buildDocument();
  });
});

await loadDefault();
buildDocument();
