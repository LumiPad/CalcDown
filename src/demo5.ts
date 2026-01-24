import { coerceRowsToTable } from "./data.js";
import { evaluateProgram, parseProgram } from "./index.js";
import { parseCsv } from "./util/csv.js";
import { formatIsoDate } from "./util/date.js";
import { CalcdownMessage, DataTable, InputType } from "./types.js";
import { validateViewsFromBlocks } from "./view_contract.js";
import type { CalcdownView, LayoutItem, LayoutSpec, TableViewColumn } from "./view_contract.js";

const runEl = document.getElementById("run");
const liveEl = document.getElementById("live");
const statusEl = document.getElementById("status");
const inputsEl = document.getElementById("inputs");
const viewsEl = document.getElementById("views");
const messagesEl = document.getElementById("messages");
const sourceEl = document.getElementById("source");

if (!(runEl instanceof HTMLButtonElement)) throw new Error("Missing #run button");
if (!(liveEl instanceof HTMLInputElement)) throw new Error("Missing #live checkbox");
if (!(statusEl instanceof HTMLSpanElement)) throw new Error("Missing #status span");
if (!(inputsEl instanceof HTMLDivElement)) throw new Error("Missing #inputs div");
if (!(viewsEl instanceof HTMLDivElement)) throw new Error("Missing #views div");
if (!(messagesEl instanceof HTMLPreElement)) throw new Error("Missing #messages pre");
if (!(sourceEl instanceof HTMLTextAreaElement)) throw new Error("Missing #source textarea");

const run = runEl;
const live = liveEl;
const status = statusEl;
const inputsRoot = inputsEl;
const viewsRoot = viewsEl;
const messages = messagesEl;
const source = sourceEl;

const DEBOUNCE_MS = 500;
let debounceTimer: number | null = null;

type OverrideValue = string | number | boolean;
type TableState = Record<string, Record<string, unknown>[]>;
type TableSchemas = Record<string, DataTable>;

let tableState: TableState = Object.create(null);
let tableSchemas: TableSchemas = Object.create(null);

let currentDocUrl: string | null = null;
let runSeq = 0;

function clear(el: HTMLElement): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

function deepCopyRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map((r) => Object.assign(Object.create(null), r));
}

function formatValue(v: unknown): string {
  if (v instanceof Date) return formatIsoDate(v);
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return String(v);
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 6 }).format(v);
  }
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "string") return v;
  if (v === null) return "null";
  if (v === undefined) return "—";
  if (Array.isArray(v)) return `[array × ${v.length}]`;
  return "[object]";
}

type ValueFormat =
  | "number"
  | "integer"
  | "percent"
  | "date"
  | { kind: "number" | "integer" | "percent" | "currency" | "date"; digits?: number; currency?: string };

function formatFormattedValue(v: unknown, fmt: ValueFormat | undefined): string {
  if (!fmt) return formatValue(v);

  const kind = typeof fmt === "string" ? fmt : fmt.kind;
  const digits =
    typeof fmt === "string"
      ? undefined
      : typeof fmt.digits === "number" && Number.isFinite(fmt.digits)
        ? Math.max(0, Math.min(12, Math.floor(fmt.digits)))
        : undefined;

  if (kind === "date") {
    if (v instanceof Date) return formatIsoDate(v);
    if (typeof v === "string") return v;
    return formatValue(v);
  }

  if (kind === "percent") {
    if (typeof v !== "number" || !Number.isFinite(v)) return formatValue(v);
    const nf = new Intl.NumberFormat(undefined, {
      maximumFractionDigits: digits ?? 2,
      minimumFractionDigits: digits ?? 0,
    });
    return `${nf.format(v)}%`;
  }

  if (kind === "currency") {
    const currency = typeof fmt === "string" ? undefined : fmt.currency;
    if (typeof v !== "number" || !Number.isFinite(v) || !currency) return formatValue(v);
    const nf = new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: digits ?? 2,
    });
    return nf.format(v);
  }

  if (kind === "integer") {
    if (typeof v !== "number" || !Number.isFinite(v)) return formatValue(v);
    const nf = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
    return nf.format(Math.trunc(v));
  }

  if (typeof v !== "number" || !Number.isFinite(v)) return formatValue(v);
  const nf = new Intl.NumberFormat(undefined, {
    maximumFractionDigits: digits ?? 2,
    minimumFractionDigits: digits ?? 0,
  });
  return nf.format(v);
}

function setStatus(kind: "idle" | "ok" | "err", text: string): void {
  const dot = status.querySelector(".dot");
  const textEl = status.querySelector("span:last-child");
  if (!(dot instanceof HTMLSpanElement) || !(textEl instanceof HTMLSpanElement)) return;
  dot.classList.remove("ok", "err");
  if (kind === "ok") dot.classList.add("ok");
  if (kind === "err") dot.classList.add("err");
  textEl.textContent = text;
}

function readInputOverrides(): Record<string, OverrideValue> {
  const out: Record<string, OverrideValue> = Object.create(null);
  for (const el of Array.from(inputsRoot.querySelectorAll<HTMLInputElement>("input[data-name]"))) {
    const name = el.dataset.name;
    const kind = el.dataset.kind;
    if (!name) continue;
    if (kind === "boolean") {
      out[name] = el.checked;
      continue;
    }
    if (el.type === "date") {
      if (el.value) out[name] = el.value;
      continue;
    }
    const n = el.valueAsNumber;
    if (Number.isFinite(n)) out[name] = n;
  }
  return out;
}

function renderInputsFromSource(markdown: string): void {
  const parsed = parseProgram(markdown);
  const program = parsed.program;

  clear(inputsRoot);

  for (const def of program.inputs) {
    const field = document.createElement("div");
    field.className = "field";

    const label = document.createElement("label");
    label.textContent = `${def.name} (${def.type.raw})`;
    field.appendChild(label);

    const input = document.createElement("input");
    input.dataset.name = def.name;

    if (def.type.name === "boolean") {
      input.type = "checkbox";
      input.dataset.kind = "boolean";
      input.checked = Boolean(def.defaultValue);
    } else if (def.type.name === "date") {
      input.type = "date";
      input.value = def.defaultValue instanceof Date ? formatIsoDate(def.defaultValue) : String(def.defaultValue);
    } else {
      input.type = "number";
      input.dataset.kind = "number";
      input.step = def.type.name === "integer" ? "1" : def.type.name === "percent" ? "0.1" : "0.01";
      input.value = typeof def.defaultValue === "number" ? String(def.defaultValue) : String(def.defaultValue);
    }

    input.addEventListener("input", () => scheduleRecompute());

    field.appendChild(input);
    inputsRoot.appendChild(field);
  }
}

function resetTablesFromProgram(parsedTables: DataTable[]): void {
  tableSchemas = Object.create(null);
  tableState = Object.create(null);

  for (const t of parsedTables) {
    tableSchemas[t.name] = t;
    if (t.source) continue;
    tableState[t.name] = deepCopyRows(t.rows);
  }
}

function buildCardsView(
  title: string | null,
  items: { key: string; label: string; format?: ValueFormat }[],
  values: Record<string, unknown>
): HTMLElement {
  const view = document.createElement("div");
  view.className = "view";

  if (title) {
    const h = document.createElement("div");
    h.className = "view-title";
    h.textContent = title;
    view.appendChild(h);
  }

  const cards = document.createElement("div");
  cards.className = "cards";

  for (const item of items) {
    const key = item.key;
    const card = document.createElement("div");
    card.className = "card";

    const k = document.createElement("div");
    k.className = "k";
    k.textContent = item.label ?? key;

    const v = document.createElement("div");
    v.className = "v";
    v.textContent = formatFormattedValue(values[key], item.format);

    card.appendChild(k);
    card.appendChild(v);
    cards.appendChild(card);
  }

  view.appendChild(cards);
  return view;
}

function buildTableView(
  title: string | null,
  columns: { key: string; label: string; format?: ValueFormat }[],
  rows: Record<string, unknown>[]
): HTMLElement {
  const view = document.createElement("div");
  view.className = "view";

  if (title) {
    const h = document.createElement("div");
    h.className = "view-title";
    h.textContent = title;
    view.appendChild(h);
  }

  const table = document.createElement("table");

  const thead = document.createElement("thead");
  const hr = document.createElement("tr");
  for (const c of columns) {
    const th = document.createElement("th");
    th.textContent = c.label ?? c.key;
    hr.appendChild(th);
  }
  thead.appendChild(hr);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  for (const row of rows) {
    const tr = document.createElement("tr");
    for (const c of columns) {
      const td = document.createElement("td");
      const value = Object.prototype.hasOwnProperty.call(row, c.key) ? row[c.key] : undefined;
      td.textContent = formatFormattedValue(value, c.format);
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }

  table.appendChild(tbody);
  view.appendChild(table);
  return view;
}

function defaultColumnsForSource(sourceName: string, rows: Record<string, unknown>[]): TableViewColumn[] {
  const schema = tableSchemas[sourceName];
  if (schema) {
    const keys = Object.keys(schema.columns);
    return keys.map((k) => ({ key: k, label: k }));
  }
  if (rows.length === 0) return [];
  return Object.keys(rows[0] ?? {})
    .sort((a, b) => a.localeCompare(b))
    .map((k) => ({ key: k, label: k }));
}

function buildLayoutContainer(spec: LayoutSpec): HTMLDivElement {
  const el = document.createElement("div");
  el.style.display = "flex";
  el.style.flexDirection = spec.direction === "row" ? "row" : "column";
  el.style.gap = "12px";
  el.style.flexWrap = spec.direction === "row" ? "wrap" : "nowrap";
  return el;
}

function buildLayout(spec: LayoutSpec, viewById: Map<string, CalcdownView>, values: Record<string, unknown>): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "view";

  if (spec.title) {
    const h = document.createElement("div");
    h.className = "view-title";
    h.textContent = spec.title;
    wrapper.appendChild(h);
  }

  const container = buildLayoutContainer(spec);
  for (const item of spec.items) {
    const child = buildLayoutItem(item, viewById, values);
    if (child) container.appendChild(child);
  }

  wrapper.appendChild(container);
  return wrapper;
}

function buildLayoutItem(item: LayoutItem, viewById: Map<string, CalcdownView>, values: Record<string, unknown>): HTMLElement | null {
  if (item.kind === "layout") return buildLayout(item.spec, viewById, values);

  const target = viewById.get(item.ref);
  if (!target) return null;

  if (target.type === "cards") {
    const title = target.spec.title ?? null;
    const items = target.spec.items.map((it) => ({
      key: it.key,
      label: it.label,
      ...(it.format ? { format: it.format as ValueFormat } : {}),
    }));
    return buildCardsView(title, items, values);
  }

  if (target.type === "table") {
    const sourceName = target.source;
    const raw = values[sourceName];
    if (!Array.isArray(raw)) return null;
    const rowObjs = raw.filter((r) => r && typeof r === "object" && !Array.isArray(r)) as Record<string, unknown>[];

    const columns = (target.spec.columns && target.spec.columns.length ? target.spec.columns : defaultColumnsForSource(sourceName, rowObjs)).map((c) => ({
      key: c.key,
      label: c.label,
      ...(c.format ? { format: c.format as ValueFormat } : {}),
    }));
    const limit = target.spec.limit;
    const limitedRows = limit !== undefined ? rowObjs.slice(0, limit) : rowObjs;
    const title = target.spec.title ?? null;
    return buildTableView(title, columns, limitedRows);
  }

  if (target.type === "layout") {
    return buildLayout(target.spec, viewById, values);
  }

  return null;
}

async function sha256Hex(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const arr = new Uint8Array(digest);
  let out = "";
  for (const b of arr) out += b.toString(16).padStart(2, "0");
  return out;
}

function parseCsvRowsToObjects(csvText: string): { header: string[]; rows: Record<string, string>[] } {
  const parsed = parseCsv(csvText);
  if (!parsed.header.length) return { header: [], rows: [] };

  const header = parsed.header;
  const rows: Record<string, string>[] = [];
  for (const row of parsed.rows) {
    const obj: Record<string, string> = Object.create(null);
    for (let i = 0; i < header.length; i++) {
      const key = header[i];
      if (!key) continue;
      obj[key] = row[i] ?? "";
    }
    rows.push(obj);
  }
  return { header, rows };
}

function csvCellToTyped(type: InputType | undefined, raw: unknown): unknown {
  if (raw === undefined || raw === null) return undefined;
  const text = String(raw);
  if (!text) return undefined;
  const t = type?.name ?? "string";

  if (t === "string") return text;
  if (t === "date" || t === "datetime") return text;

  if (t === "boolean") {
    if (text === "true") return true;
    if (text === "false") return false;
    if (text === "1") return true;
    if (text === "0") return false;
    return text;
  }

  if (t === "integer") {
    const n = Number(text);
    return Number.isFinite(n) ? Math.trunc(n) : text;
  }

  if (t === "number" || t === "decimal" || t === "percent" || t === "currency") {
    const n = Number(text);
    return Number.isFinite(n) ? n : text;
  }

  return text;
}

async function loadExternalTables(programTables: DataTable[], originUrl: string): Promise<{
  overrides: Record<string, unknown>;
  messages: CalcdownMessage[];
  ok: boolean;
}> {
  const overrides: Record<string, unknown> = Object.create(null);
  const messages: CalcdownMessage[] = [];

  let ok = true;
  for (const t of programTables) {
    const source = t.source;
    if (!source) continue;

    const resolvedUrl = new URL(source.uri, originUrl).toString();
    let text: string;
    try {
      const res = await fetch(resolvedUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      text = await res.text();
    } catch (err) {
      ok = false;
      messages.push({
        severity: "error",
        code: "CD_DATA_SOURCE_READ",
        message: `Failed to load data source: ${err instanceof Error ? err.message : String(err)}`,
        file: resolvedUrl,
        blockLang: "data",
        nodeName: t.name,
      });
      continue;
    }

    const expected = source.hash;
    const expectedHex = expected.startsWith("sha256:") ? expected.slice("sha256:".length) : null;
    const actualHex = await sha256Hex(text);
    if (!expectedHex || expectedHex.toLowerCase() !== actualHex.toLowerCase()) {
      ok = false;
      messages.push({
        severity: "error",
        code: "CD_DATA_HASH_MISMATCH",
        message: `Hash mismatch for ${source.uri} (expected ${expected}, got sha256:${actualHex})`,
        file: resolvedUrl,
        blockLang: "data",
        nodeName: t.name,
      });
      continue;
    }

    let rawRows: unknown[] = [];
    let baseLine = 1;

    if (source.format === "csv") {
      const parsed = parseCsvRowsToObjects(text);
      const declared = Object.keys(t.columns);
      for (const col of declared) {
        if (!parsed.header.includes(col)) {
          ok = false;
          messages.push({
            severity: "error",
            code: "CD_DATA_CSV_MISSING_COLUMN",
            message: `CSV source is missing declared column: ${col}`,
            file: resolvedUrl,
            line: 1,
            blockLang: "data",
            nodeName: t.name,
          });
        }
      }

      baseLine = 2;
      rawRows = parsed.rows.map((r) => {
        const row: Record<string, unknown> = Object.create(null);
        for (const [k, v] of Object.entries(r)) {
          row[k] = csvCellToTyped(t.columns[k], v);
        }
        return row;
      });
    } else if (source.format === "json") {
      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch (err) {
        ok = false;
        messages.push({
          severity: "error",
          code: "CD_DATA_JSON_PARSE",
          message: `Failed to parse JSON: ${err instanceof Error ? err.message : String(err)}`,
          file: resolvedUrl,
          line: 1,
          blockLang: "data",
          nodeName: t.name,
        });
        continue;
      }
      if (!Array.isArray(data)) {
        ok = false;
        messages.push({
          severity: "error",
          code: "CD_DATA_JSON_NOT_ARRAY",
          message: "JSON source must be an array of objects",
          file: resolvedUrl,
          line: 1,
          blockLang: "data",
          nodeName: t.name,
        });
        continue;
      }
      rawRows = data as unknown[];
      baseLine = 1;
    }

    const coerced = coerceRowsToTable(t.name, t.primaryKey, t.columns, rawRows, {
      baseLine,
      blockLang: "data",
      file: resolvedUrl,
    });
    messages.push(...coerced.messages);
    overrides[t.name] = coerced.rows;
    if (coerced.messages.some((m) => m.severity === "error")) ok = false;
  }

  return { overrides, messages, ok };
}

async function recompute(): Promise<void> {
  const seq = ++runSeq;

  const parsed = parseProgram(source.value);
  if (Object.keys(tableSchemas).length === 0) resetTablesFromProgram(parsed.program.tables);

  const originUrl = currentDocUrl;
  if (!originUrl) {
    setStatus("err", "Missing document URL (reload page).");
    return;
  }

  setStatus("idle", "Loading external data…");
  const external = await loadExternalTables(parsed.program.tables, originUrl);
  if (seq !== runSeq) return;

  setStatus(external.ok ? "ok" : "err", external.ok ? "External data OK (hash verified)" : "External data errors");

  const overrides: Record<string, unknown> = Object.assign(Object.create(null), readInputOverrides(), tableState, external.overrides);
  const evaluated = evaluateProgram(parsed.program, overrides);

  clear(viewsRoot);

  const validated = validateViewsFromBlocks(parsed.program.blocks);
  const viewMessages: CalcdownMessage[] = [...validated.messages];

  if (validated.views.length > 0) {
    const viewById = new Map(validated.views.map((v) => [v.id, v]));
    const rootLayout = validated.views.find((v) => v.type === "layout") ?? null;

    if (rootLayout && rootLayout.type === "layout") {
      viewsRoot.appendChild(buildLayout(rootLayout.spec, viewById, evaluated.values));
    } else {
      for (const view of validated.views) {
        if (view.type === "layout") continue;
        const el = buildLayoutItem({ kind: "ref", ref: view.id }, viewById, evaluated.values);
        if (el) viewsRoot.appendChild(el);
      }
    }
  }

  messages.textContent = JSON.stringify(
    {
      parseMessages: parsed.messages,
      externalMessages: external.messages,
      evalMessages: evaluated.messages,
      viewMessages,
      overrides,
    },
    null,
    2
  );
}

function scheduleRecompute(): void {
  if (!live.checked) return;
  if (debounceTimer !== null) window.clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(() => {
    debounceTimer = null;
    void recompute();
  }, DEBOUNCE_MS);
}

async function loadDefault(): Promise<void> {
  const res = await fetch("../docs/examples/invoice-external.calc.md");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  currentDocUrl = res.url;
  source.value = await res.text();
}

run.addEventListener("click", () => {
  if (debounceTimer !== null) {
    window.clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  const parsed = parseProgram(source.value);
  resetTablesFromProgram(parsed.program.tables);
  renderInputsFromSource(source.value);
  void recompute();
});

live.addEventListener("change", () => {
  if (live.checked) scheduleRecompute();
});

source.addEventListener("input", () => {
  if (!live.checked) return;
  if (debounceTimer !== null) window.clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(() => {
    debounceTimer = null;
    const parsed = parseProgram(source.value);
    resetTablesFromProgram(parsed.program.tables);
    renderInputsFromSource(source.value);
    void recompute();
  }, DEBOUNCE_MS);
});

await loadDefault();
{
  const parsed = parseProgram(source.value);
  resetTablesFromProgram(parsed.program.tables);
}
renderInputsFromSource(source.value);
setStatus("idle", "Loading external data…");
await recompute();
