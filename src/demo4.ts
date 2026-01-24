import { evaluateProgram, parseProgram } from "./index.js";
import { formatIsoDate, parseIsoDate } from "./util/date.js";
import { CalcdownMessage, DataTable } from "./types.js";
import { validateViewsFromBlocks } from "./view_contract.js";
import type { CalcdownView, LayoutItem, LayoutSpec, TableViewColumn } from "./view_contract.js";

const runEl = document.getElementById("run");
const liveEl = document.getElementById("live");
const exampleEl = document.getElementById("example");
const chartModeEl = document.getElementById("chartMode");
const inputsEl = document.getElementById("inputs");
const viewsEl = document.getElementById("views");
const messagesEl = document.getElementById("messages");
const sourceEl = document.getElementById("source");

if (!(runEl instanceof HTMLButtonElement)) throw new Error("Missing #run button");
if (!(liveEl instanceof HTMLInputElement)) throw new Error("Missing #live checkbox");
if (!(exampleEl instanceof HTMLSelectElement)) throw new Error("Missing #example select");
if (!(chartModeEl instanceof HTMLSelectElement)) throw new Error("Missing #chartMode select");
if (!(inputsEl instanceof HTMLDivElement)) throw new Error("Missing #inputs div");
if (!(viewsEl instanceof HTMLDivElement)) throw new Error("Missing #views div");
if (!(messagesEl instanceof HTMLPreElement)) throw new Error("Missing #messages pre");
if (!(sourceEl instanceof HTMLTextAreaElement)) throw new Error("Missing #source textarea");

const run = runEl;
const live = liveEl;
const exampleSelect = exampleEl;
const chartModeSelect = chartModeEl;
const inputsRoot = inputsEl;
const viewsRoot = viewsEl;
const messages = messagesEl;
const source = sourceEl;

const DEBOUNCE_MS = 500;
let debounceTimer: number | null = null;

type ChartMode = "spec" | "line" | "bar";

function readChartMode(): ChartMode {
  const v = chartModeSelect.value;
  if (v === "line" || v === "bar" || v === "spec") return v;
  return "spec";
}

type OverrideValue = string | number | boolean;
type TableState = Record<string, Record<string, unknown>[]>;
type TableSchemas = Record<string, DataTable>;

let tableState: TableState = Object.create(null);
let tableSchemas: TableSchemas = Object.create(null);

const EXAMPLES: Record<string, string> = Object.freeze({
  mortgage: "../docs/examples/mortgage.calc.md",
  savings: "../docs/examples/savings.calc.md",
  invoice: "../docs/examples/invoice.calc.md",
  cashflow: "../docs/examples/simple-cashflow.calc.md",
});

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
  sourceName: string,
  columns: { key: string; label: string; format?: ValueFormat }[],
  rows: Record<string, unknown>[],
  editable: boolean
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
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex]!;
    const tr = document.createElement("tr");
    for (const c of columns) {
      const td = document.createElement("td");
      const value = Object.prototype.hasOwnProperty.call(row, c.key) ? row[c.key] : undefined;

      if (editable) {
        const input = document.createElement("input");
        input.dataset.row = String(rowIndex);
        input.dataset.col = c.key;

        if (value instanceof Date) {
          input.type = "date";
          input.value = formatIsoDate(value);
          input.addEventListener("input", () => {
            const v = input.value ? parseIsoDate(input.value) : undefined;
            tableState[sourceName]![rowIndex]![c.key] = v;
            scheduleRecompute();
          });
        } else if (typeof value === "number") {
          input.type = "number";
          input.value = Number.isFinite(value) ? String(value) : "";
          input.addEventListener("input", () => {
            const n = input.valueAsNumber;
            tableState[sourceName]![rowIndex]![c.key] = Number.isFinite(n) ? n : undefined;
            scheduleRecompute();
          });
        } else {
          input.type = "text";
          input.value = typeof value === "string" ? value : value === undefined || value === null ? "" : String(value);
          input.addEventListener("input", () => {
            tableState[sourceName]![rowIndex]![c.key] = input.value;
            scheduleRecompute();
          });
        }

        td.appendChild(input);
      } else {
        td.textContent = formatFormattedValue(value, c.format);
      }

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

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  if (v instanceof Date) return v.getTime();
  return null;
}

function formatXLabel(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  if (typeof v === "string") return v;
  return String(v);
}

function buildLineChartView(
  title: string,
  subtitle: string,
  rows: Record<string, unknown>[],
  xField: string,
  yField: string
): HTMLElement {
  const view = document.createElement("div");
  view.className = "view";

  const h = document.createElement("div");
  h.className = "view-title";
  h.textContent = title;
  view.appendChild(h);

  const sub = document.createElement("div");
  sub.className = "muted";
  sub.style.marginBottom = "10px";
  sub.textContent = subtitle;
  view.appendChild(sub);

  const points: { x: number; y: number }[] = [];
  for (const row of rows) {
    const x = asNumber(row[xField]);
    const y = asNumber(row[yField]);
    if (x === null || y === null) continue;
    points.push({ x, y });
  }

  if (points.length < 2) {
    const msg = document.createElement("div");
    msg.textContent = `Not enough data to plot ${yField} vs ${xField}.`;
    view.appendChild(msg);
    return view;
  }

  points.sort((a, b) => a.x - b.x);

  let xmin = points[0]!.x;
  let xmax = points[0]!.x;
  let ymin = points[0]!.y;
  let ymax = points[0]!.y;
  for (const p of points) {
    xmin = Math.min(xmin, p.x);
    xmax = Math.max(xmax, p.x);
    ymin = Math.min(ymin, p.y);
    ymax = Math.max(ymax, p.y);
  }
  if (xmax === xmin) xmax = xmin + 1;
  if (ymax === ymin) ymax = ymin + 1;

  const width = 720;
  const height = 260;
  const margin = { top: 10, right: 14, bottom: 24, left: 46 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;

  const sx = (x: number) => margin.left + ((x - xmin) / (xmax - xmin)) * plotW;
  const sy = (y: number) => margin.top + plotH - ((y - ymin) / (ymax - ymin)) * plotH;

  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", String(height));
  svg.style.display = "block";

  const grid = document.createElementNS(svgNS, "path");
  grid.setAttribute("fill", "none");
  grid.setAttribute("stroke", "#eef0f6");
  grid.setAttribute("stroke-width", "1");
  const gridLines: string[] = [];
  for (let i = 0; i <= 4; i++) {
    const y = margin.top + (plotH * i) / 4;
    gridLines.push(`M ${margin.left} ${y} L ${margin.left + plotW} ${y}`);
  }
  grid.setAttribute("d", gridLines.join(" "));
  svg.appendChild(grid);

  const axis = document.createElementNS(svgNS, "path");
  axis.setAttribute("fill", "none");
  axis.setAttribute("stroke", "#c9cedf");
  axis.setAttribute("stroke-width", "1");
  axis.setAttribute(
    "d",
    `M ${margin.left} ${margin.top} L ${margin.left} ${margin.top + plotH} L ${margin.left + plotW} ${margin.top + plotH}`
  );
  svg.appendChild(axis);

  const path = document.createElementNS(svgNS, "path");
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "#4c6fff");
  path.setAttribute("stroke-width", "2");
  path.setAttribute("stroke-linejoin", "round");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute(
    "d",
    points
      .map((p, idx) => `${idx === 0 ? "M" : "L"} ${sx(p.x).toFixed(2)} ${sy(p.y).toFixed(2)}`)
      .join(" ")
  );
  svg.appendChild(path);

  view.appendChild(svg);
  return view;
}

function buildBarChartView(
  title: string,
  subtitle: string,
  rows: Record<string, unknown>[],
  xField: string,
  yField: string
): HTMLElement {
  const view = document.createElement("div");
  view.className = "view";

  const h = document.createElement("div");
  h.className = "view-title";
  h.textContent = title;
  view.appendChild(h);

  const sub = document.createElement("div");
  sub.className = "muted";
  sub.style.marginBottom = "10px";
  sub.textContent = subtitle;
  view.appendChild(sub);

  const points: { label: string; y: number }[] = [];
  for (const row of rows) {
    const y = asNumber(row[yField]);
    if (y === null) continue;
    points.push({ label: formatXLabel(row[xField]), y });
  }

  if (points.length === 0) {
    const msg = document.createElement("div");
    msg.textContent = `No data to plot ${yField} by ${xField}.`;
    view.appendChild(msg);
    return view;
  }

  let ymin = 0;
  let ymax = points[0]!.y;
  for (const p of points) ymax = Math.max(ymax, p.y);
  if (ymax === ymin) ymax = ymin + 1;

  const width = 720;
  const height = 260;
  const margin = { top: 10, right: 14, bottom: 40, left: 46 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;

  const y0 = margin.top + plotH;
  const sx = (i: number) => margin.left + (plotW * i) / points.length;
  const barW = (plotW / points.length) * 0.72;
  const sy = (y: number) => margin.top + plotH - ((y - ymin) / (ymax - ymin)) * plotH;

  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", String(height));
  svg.style.display = "block";

  const axis = document.createElementNS(svgNS, "path");
  axis.setAttribute("fill", "none");
  axis.setAttribute("stroke", "#c9cedf");
  axis.setAttribute("stroke-width", "1");
  axis.setAttribute(
    "d",
    `M ${margin.left} ${margin.top} L ${margin.left} ${y0} L ${margin.left + plotW} ${y0}`
  );
  svg.appendChild(axis);

  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    const x0 = sx(i) + (plotW / points.length - barW) / 2;
    const y = sy(p.y);
    const rect = document.createElementNS(svgNS, "rect");
    rect.setAttribute("x", x0.toFixed(2));
    rect.setAttribute("y", y.toFixed(2));
    rect.setAttribute("width", barW.toFixed(2));
    rect.setAttribute("height", (y0 - y).toFixed(2));
    rect.setAttribute("fill", "#4c6fff");
    rect.setAttribute("opacity", "0.85");
    svg.appendChild(rect);

    const tx = document.createElementNS(svgNS, "text");
    tx.setAttribute("x", (x0 + barW / 2).toFixed(2));
    tx.setAttribute("y", String(y0 + 18));
    tx.setAttribute("fill", "#6a718a");
    tx.setAttribute("font-size", "10");
    tx.setAttribute("text-anchor", "middle");
    tx.textContent = p.label;
    svg.appendChild(tx);
  }

  view.appendChild(svg);
  return view;
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
  const chartMode = readChartMode();
  for (const item of spec.items) {
    const child = buildLayoutItem(item, viewById, values, chartMode);
    if (child) container.appendChild(child);
  }

  wrapper.appendChild(container);
  return wrapper;
}

function buildLayoutItem(
  item: LayoutItem,
  viewById: Map<string, CalcdownView>,
  values: Record<string, unknown>,
  chartMode: ChartMode
): HTMLElement | null {
  if (item.kind === "layout") return buildLayout(item.spec, viewById, values);

  const target = viewById.get(item.ref);
  if (!target) {
    const missing = document.createElement("div");
    missing.className = "view";
    const msg = document.createElement("div");
    msg.className = "view-title";
    msg.textContent = `Missing view: ${item.ref}`;
    missing.appendChild(msg);
    return missing;
  }

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

    const schema = tableSchemas[sourceName];
    const editable = Boolean(target.spec.editable && schema && !schema.source && sourceName in tableState);
    const limit = target.spec.limit;
    const limitedRows = limit !== undefined ? rowObjs.slice(0, limit) : rowObjs;
    const title = target.spec.title ?? null;
    return buildTableView(title, sourceName, columns, limitedRows, editable);
  }

  if (target.type === "chart") {
    const sourceName = target.source;
    const raw = values[sourceName];
    if (!Array.isArray(raw)) return null;
    const rows = raw.filter((r) => r && typeof r === "object" && !Array.isArray(r)) as Record<string, unknown>[];
    const xField = target.spec.x.key;
    const yField = target.spec.y.key;
    const title = target.spec.title ?? target.id;
    const mark = chartMode === "spec" ? target.spec.kind : chartMode;
    if (mark === "line") return buildLineChartView(title, `${sourceName}.${yField} over ${xField}`, rows, xField, yField);
    if (mark === "bar") return buildBarChartView(title, `${sourceName}.${yField} by ${xField}`, rows, xField, yField);
    return null;
  }

  return null;
}

function recompute(): void {
  const parsed = parseProgram(source.value);

  if (Object.keys(tableSchemas).length === 0) {
    resetTablesFromProgram(parsed.program.tables);
  }

  const overrides: Record<string, unknown> = Object.assign(Object.create(null), readInputOverrides(), tableState);
  const evaluated = evaluateProgram(parsed.program, overrides);

  clear(viewsRoot);

  const validated = validateViewsFromBlocks(parsed.program.blocks);
  const viewMessages: CalcdownMessage[] = [...validated.messages];

  if (validated.views.length > 0) {
    const viewById = new Map(validated.views.map((v) => [v.id, v]));
    const rootLayout = validated.views.find((v) => v.type === "layout") ?? null;
    const chartMode = readChartMode();

    if (rootLayout && rootLayout.type === "layout") {
      viewsRoot.appendChild(buildLayout(rootLayout.spec, viewById, evaluated.values));
    } else {
      for (const view of validated.views) {
        if (view.type === "layout") continue;
        const el = buildLayoutItem({ kind: "ref", ref: view.id }, viewById, evaluated.values, chartMode);
        if (el) viewsRoot.appendChild(el);
      }
    }
  }

  messages.textContent = JSON.stringify(
    {
      parseMessages: parsed.messages,
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
    recompute();
  }, DEBOUNCE_MS);
}

async function loadSelectedExample(): Promise<void> {
  const key = exampleSelect.value;
  const url = EXAMPLES[key];
  if (!url) throw new Error(`Unknown example: ${key}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  source.value = await res.text();
}

exampleSelect.addEventListener("change", async () => {
  if (debounceTimer !== null) {
    window.clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  await loadSelectedExample();
  const parsed = parseProgram(source.value);
  resetTablesFromProgram(parsed.program.tables);
  renderInputsFromSource(source.value);
  recompute();
});

chartModeSelect.addEventListener("change", () => recompute());

run.addEventListener("click", () => {
  if (debounceTimer !== null) {
    window.clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  const parsed = parseProgram(source.value);
  resetTablesFromProgram(parsed.program.tables);
  renderInputsFromSource(source.value);
  recompute();
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
    recompute();
  }, DEBOUNCE_MS);
});

await loadSelectedExample();
{
  const parsed = parseProgram(source.value);
  resetTablesFromProgram(parsed.program.tables);
}
renderInputsFromSource(source.value);
recompute();

