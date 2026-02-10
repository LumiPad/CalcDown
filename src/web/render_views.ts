/**
 * Purpose: Render validated views into DOM cards, tables, charts, layouts.
 * Intent: Translate runtime values into deterministic interactive view components.
 */

import type { DataTable, InputType } from "../types.js";
import { parseExpression } from "../calcscript/parser.js";
import { evaluateExpression } from "../calcscript/eval.js";
import { std } from "../stdlib/std.js";
import {
  defaultLabelForKey,
  type CardsMetricItem,
  type CardsSparklineItem,
  type CardsViewSpecItem,
  type CalcdownView,
  type ConditionalFormatRule,
  type ConditionalFormatStyle,
  type LayoutItem,
  type LayoutSpec,
  type TableViewColumn,
  type ValueFormat,
} from "../view_contract.js";
import { formatFormattedValue } from "./format.js";
import { buildBarChartCard, buildComboChartCard, buildLineChartCard, type ChartCardClasses, type ChartSeriesSpec } from "./charts.js";

export type ChartMode = "spec" | "line" | "bar";

export interface TableEditEvent {
  tableName: string;
  primaryKey: string | null;
  column: string;
  value: unknown;
}

export interface RenderViewsOptions {
  container: HTMLElement;
  views: CalcdownView[];
  values: Record<string, unknown>;
  chartMode?: ChartMode;
  tableSchemas?: Record<string, DataTable>;
  valueTypes?: Record<string, InputType>;
  onEditTableCell?: (ev: TableEditEvent) => void;
}

export interface RenderInlineViewsOptions {
  container: HTMLElement;
  views: CalcdownView[]; // all known views (for layout refs)
  render: string[]; // view ids to render in order
  values: Record<string, unknown>;
  chartMode?: ChartMode;
  tableSchemas?: Record<string, DataTable>;
  valueTypes?: Record<string, InputType>;
  onEditTableCell?: (ev: TableEditEvent) => void;
}

function clear(el: HTMLElement): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

function viewTitle(title: string): HTMLDivElement {
  const h = document.createElement("div");
  h.className = "view-title";
  h.textContent = title;
  return h;
}

const CURRENCY_HEADER_HINT_CACHE = new Map<string, string>();

function currencyHeaderHint(codeRaw: string): string {
  const code = codeRaw.trim().toUpperCase();
  if (!code) return "";
  const cached = CURRENCY_HEADER_HINT_CACHE.get(code);
  if (cached !== undefined) return cached;

  let hint = code;
  try {
    const nf = new Intl.NumberFormat(undefined, { style: "currency", currency: code, currencyDisplay: "symbol" });
    const currencyPart = nf.formatToParts(0).find((p) => p.type === "currency")?.value;
    if (currencyPart && currencyPart.trim()) hint = currencyPart.trim();
  } catch {
    // Ignore Intl errors; fall back to the ISO code.
  }

  // Avoid ambiguous "$" without a country prefix in common locales.
  if (hint === "$") hint = code === "USD" ? "US$" : code;

  CURRENCY_HEADER_HINT_CACHE.set(code, hint);
  return hint;
}

function isZeroDecimalCurrencyCode(codeRaw: string | undefined): boolean {
  return (codeRaw ?? "").trim().toUpperCase() === "ISK";
}

function resolveCurrencyFormatFromType(t: InputType | undefined): ValueFormat | null {
  if (!t) return null;
  if (t.name !== "currency") return null;
  const code = t.args[0];
  if (!code || !code.trim()) return null;
  return { kind: "currency", currency: code.trim() } satisfies ValueFormat;
}

function resolveFormat(raw: ValueFormat | undefined, inferredFrom: InputType | undefined): ValueFormat | undefined {
  if (!raw) return inferredFormatForType(inferredFrom);
  if (raw === "currency") {
    const resolved = resolveCurrencyFormatFromType(inferredFrom);
    return resolved ?? raw;
  }
  if (typeof raw === "object" && raw.kind === "currency" && !raw.currency) {
    const resolved = resolveCurrencyFormatFromType(inferredFrom);
    if (resolved && typeof resolved === "object") {
      const digits = typeof raw.digits === "number" && Number.isFinite(raw.digits) ? raw.digits : undefined;
      return Object.assign(Object.create(null), {
        kind: "currency",
        currency: resolved.currency,
        ...(digits !== undefined ? { digits } : {}),
      }) as ValueFormat;
    }
  }
  return raw;
}

function downsample(values: number[], maxPoints: number): number[] {
  if (values.length <= maxPoints) return values;
  const step = Math.ceil(values.length / maxPoints);
  const out: number[] = [];
  for (let i = 0; i < values.length; i += step) out.push(values[i]!);
  return out;
}

function isSparklineItem(item: CardsViewSpecItem): item is CardsSparklineItem {
  return (item as any)?.type === "sparkline";
}

function buildSparklineSvg(values: number[]): SVGSVGElement | null {
  const ys = values.filter((v) => typeof v === "number" && Number.isFinite(v));
  if (ys.length < 2) return null;

  const points = downsample(ys, 80);
  let ymin = points[0]!;
  let ymax = points[0]!;
  for (const y of points) {
    ymin = Math.min(ymin, y);
    ymax = Math.max(ymax, y);
  }
  if (ymax === ymin) ymax = ymin + 1;

  const width = 100;
  const height = 32;
  const pad = 2;
  const plotW = width - pad * 2;
  const plotH = height - pad * 2;

  const sx = (i: number) => pad + (i / (points.length - 1)) * plotW;
  const sy = (y: number) => pad + (1 - (y - ymin) / (ymax - ymin)) * plotH;

  const d = points
    .map((y, i) => `${i === 0 ? "M" : "L"} ${sx(i).toFixed(2)} ${sy(y).toFixed(2)}`)
    .join(" ");

  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", String(height));
  svg.classList.add("sparkline");

  const path = document.createElementNS(svgNS, "path");
  path.setAttribute("d", d);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "2");
  path.setAttribute("stroke-linejoin", "round");
  path.setAttribute("stroke-linecap", "round");
  svg.appendChild(path);

  return svg;
}

function buildCardsView(
  title: string | null,
  items: CardsViewSpecItem[],
  values: Record<string, unknown>,
  valueTypes: Record<string, InputType> | undefined
): HTMLElement {
  const view = document.createElement("div");
  view.className = "view";

  if (title) view.appendChild(viewTitle(title));

  const cards = document.createElement("div");
  cards.className = "cards";
  for (const item of items) {
    const card = document.createElement("div");
    card.className = "card";

    if (isSparklineItem(item)) {
      const k = document.createElement("div");
      k.className = "k";
      k.textContent = item.label;
      card.appendChild(k);

      const seriesRaw = values[item.source];
      const rows = Array.isArray(seriesRaw) ? seriesRaw : [];
      const ys: number[] = [];
      for (const r of rows) {
        if (!r || typeof r !== "object" || Array.isArray(r)) continue;
        const v = Object.prototype.hasOwnProperty.call(r, item.key) ? (r as Record<string, unknown>)[item.key] : undefined;
        if (typeof v === "number" && Number.isFinite(v)) ys.push(v);
      }

      const svg = buildSparklineSvg(ys);
      if (svg) {
        const wrap = document.createElement("div");
        wrap.className = "sparkline-wrap";
        wrap.appendChild(svg);
        card.appendChild(wrap);
      } else {
        const v = document.createElement("div");
        v.className = "v muted";
        v.textContent = "—";
        card.appendChild(v);
      }

      cards.appendChild(card);
      continue;
    }

    const metric = item as CardsMetricItem;
    const k = document.createElement("div");
    k.className = "k";
    k.textContent = metric.label ?? metric.key;

    const v = document.createElement("div");
    v.className = "v";
    const fmt = resolveFormat(metric.format, valueTypes ? valueTypes[metric.key] : undefined);
    v.textContent = formatFormattedValue(values[metric.key], fmt);

    card.appendChild(k);
    card.appendChild(v);

    const compare = metric.compare;
    if (compare) {
      const cmpValRaw = values[compare.key];
      const cmpFmt = resolveFormat(compare.format, valueTypes ? valueTypes[compare.key] : undefined);
      const cmpText = formatFormattedValue(cmpValRaw, cmpFmt);

      const delta = document.createElement("div");
      delta.className = "delta";

      const deltaValue = document.createElement("span");
      deltaValue.className = "delta-value";
      deltaValue.textContent = cmpText;

      const deltaLabel = document.createElement("span");
      deltaLabel.className = "delta-label";
      deltaLabel.textContent = compare.label;

      if (typeof cmpValRaw === "number" && Number.isFinite(cmpValRaw)) {
        const sign = cmpValRaw === 0 ? 0 : cmpValRaw > 0 ? 1 : -1;
        delta.classList.add(sign > 0 ? "delta-positive" : sign < 0 ? "delta-negative" : "delta-neutral");
      }

      delta.appendChild(deltaValue);
      delta.appendChild(deltaLabel);
      card.appendChild(delta);
    }

    cards.appendChild(card);
  }

  view.appendChild(cards);
  return view;
}

function defaultColumnsForSource(sourceName: string, rows: Record<string, unknown>[], schemas: Record<string, DataTable> | undefined): TableViewColumn[] {
  const schema = schemas ? schemas[sourceName] : undefined;
  if (schema) {
    const keys = Object.keys(schema.columns);
    return keys.map((k) => ({ key: k, label: defaultLabelForKey(k) }));
  }
  if (rows.length === 0) return [];
  return Object.keys(rows[0] ?? {})
    .sort((a, b) => a.localeCompare(b))
    .map((k) => ({ key: k, label: defaultLabelForKey(k) }));
}

function inferredFormatForType(t: DataTable["columns"][string] | undefined): ValueFormat | undefined {
  if (!t) return undefined;
  if (t.name === "integer") return "integer";
  if (t.name === "number" || t.name === "decimal") return "number";
  if (t.name === "percent") return "percent";
  if (t.name === "date") return "date";
  if (t.name === "currency") {
    const code = t.args[0];
    return code ? ({ kind: "currency", currency: code } satisfies ValueFormat) : "number";
  }
  return undefined;
}

const CONDFORM_EXPR_CACHE = new Map<string, ReturnType<typeof parseExpression>>();
const EMPTY_TABLE_PK_BY_ARRAY = new WeakMap<object, { primaryKey: string }>();
const VISIBLE_EXPR_CACHE = new Map<string, ReturnType<typeof parseExpression>>();

function isViewVisible(view: CalcdownView, values: Record<string, unknown>): boolean {
  const raw = view.visible as unknown;
  if (raw === undefined) return true;
  if (raw === true) return true;
  if (raw === false) return false;
  if (typeof raw !== "string" || !raw.trim()) return true;

  const when = raw.trim();
  let expr = VISIBLE_EXPR_CACHE.get(when);
  if (!expr) {
    try {
      expr = parseExpression(when);
      VISIBLE_EXPR_CACHE.set(when, expr);
    } catch {
      return true;
    }
  }

  try {
    const out = evaluateExpression(expr, values, std, EMPTY_TABLE_PK_BY_ARRAY);
    if (typeof out === "boolean") return out;
    return true;
  } catch {
    return true;
  }
}

function applyConditionalFormatting(
  td: HTMLTableCellElement,
  rules: ConditionalFormatRule[] | undefined,
  value: unknown,
  row: Record<string, unknown>
): void {
  if (!rules || rules.length === 0) return;

  for (const rule of rules) {
    const when = rule.when;
    let expr = CONDFORM_EXPR_CACHE.get(when);
    if (!expr) {
      try {
        expr = parseExpression(when);
        CONDFORM_EXPR_CACHE.set(when, expr);
      } catch {
        continue;
      }
    }

    let matches = false;
    try {
      const out = evaluateExpression(expr, { value, row }, std, EMPTY_TABLE_PK_BY_ARRAY);
      matches = out === true;
    } catch {
      matches = false;
    }
    if (!matches) continue;

    const style: ConditionalFormatStyle = rule.style;
    if (typeof style === "string") {
      td.classList.add(`cf-${style}`);
      return;
    }

    if (style && typeof style === "object") {
      const color = style.color;
      const backgroundColor = style.backgroundColor;
      const fontWeight = style.fontWeight;
      if (typeof color === "string") td.style.color = color;
      if (typeof backgroundColor === "string") td.style.backgroundColor = backgroundColor;
      if (typeof fontWeight === "string") td.style.fontWeight = fontWeight;
      return;
    }
  }
}

function buildTableView(
  title: string | null,
  sourceName: string,
  columns: TableViewColumn[],
  rows: Record<string, unknown>[],
  opts: { editable: boolean; schema?: DataTable; onEditTableCell?: (ev: TableEditEvent) => void }
): HTMLElement {
  const view = document.createElement("div");
  view.className = "view";
  if (title) view.appendChild(viewTitle(title));

  const schemaCols = opts.schema?.columns ?? null;
  const pkKey = opts.schema?.primaryKey ?? null;

  const dataBars = new Map<string, { color: string; max: number }>();
  for (const c of columns) {
    const bar = c.dataBar;
    if (!bar) continue;
    const color = typeof bar.color === "string" && bar.color.trim() ? bar.color.trim() : "var(--calcdown-data-bar, #3b82f6)";
    let max: number | null = null;
    if (typeof bar.max === "number" && Number.isFinite(bar.max) && bar.max > 0) {
      max = bar.max;
    } else {
      let m = 0;
      for (const row of rows) {
        const v = Object.prototype.hasOwnProperty.call(row, c.key) ? row[c.key] : undefined;
        if (typeof v !== "number" || !Number.isFinite(v)) continue;
        m = Math.max(m, Math.abs(v));
      }
      max = m > 0 ? m : 1;
    }
    dataBars.set(c.key, { color, max });
  }

  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const trh = document.createElement("tr");
  for (const c of columns) {
    const th = document.createElement("th");
    let label = c.label;
    if (opts.editable && schemaCols) {
      const t = schemaCols[c.key];
      if (t?.name === "currency") {
        const code = t.args[0];
        if (code && code.trim()) {
          const hint = currencyHeaderHint(code);
          if (hint) label = `${label} (${hint})`;
        }
      }
    }
    th.textContent = label;
    trh.appendChild(th);
  }
  thead.appendChild(trh);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex]!;
    const pkRaw = pkKey ? row[pkKey] : undefined;
    const pk =
      typeof pkRaw === "string" ? pkRaw : typeof pkRaw === "number" && Number.isFinite(pkRaw) ? String(pkRaw) : null;

    const tr = document.createElement("tr");

    for (const c of columns) {
      const td = document.createElement("td");
      const value = Object.prototype.hasOwnProperty.call(row, c.key) ? row[c.key] : undefined;

      applyConditionalFormatting(td, c.conditionalFormat, value, row);

      if (opts.editable && opts.onEditTableCell && pkKey && pk && schemaCols && c.key in schemaCols) {
        const type = schemaCols[c.key]!;
        const input = document.createElement("input");

        if (type.name === "integer" || type.name === "number" || type.name === "decimal" || type.name === "percent" || type.name === "currency") {
          input.type = "number";
          const isInteger = type.name === "integer";
          const isZeroDecimal = type.name === "currency" && isZeroDecimalCurrencyCode(type.args[0]);
          const forceWholeNumber = isInteger || isZeroDecimal;
          input.step = forceWholeNumber ? "1" : "0.01";
          input.value = typeof value === "number" && Number.isFinite(value) ? String(value) : "";
          input.addEventListener("input", () => {
            const next = input.valueAsNumber;
            if (input.value !== "" && !Number.isFinite(next)) return;
            const nextValue =
              input.value === ""
                ? undefined
                : isInteger
                  ? Math.trunc(next)
                  : isZeroDecimal
                    ? Math.round(next)
                    : next;
            opts.onEditTableCell?.({ tableName: sourceName, primaryKey: pk, column: c.key, value: nextValue });
          });
        } else if (type.name === "date") {
          input.type = "date";
          input.value = value instanceof Date ? value.toISOString().slice(0, 10) : typeof value === "string" ? value : "";
          input.addEventListener("input", () => {
            if (!input.value) return;
            opts.onEditTableCell?.({ tableName: sourceName, primaryKey: pk, column: c.key, value: input.value });
          });
        } else {
          input.type = "text";
          input.value = typeof value === "string" ? value : value === undefined || value === null ? "" : String(value);
          input.addEventListener("input", () => {
            opts.onEditTableCell?.({ tableName: sourceName, primaryKey: pk, column: c.key, value: input.value });
          });
        }

        td.appendChild(input);
      } else {
        const text = formatFormattedValue(value, c.format);
        const bar = dataBars.get(c.key) ?? null;
        if (bar && typeof value === "number" && Number.isFinite(value)) {
          const ratio = Math.min(1, Math.abs(value) / bar.max);
          td.classList.add("has-data-bar");

          const barEl = document.createElement("div");
          barEl.className = "data-bar";
          barEl.style.width = `${(ratio * 100).toFixed(2)}%`;
          barEl.style.backgroundColor = bar.color;

          const span = document.createElement("span");
          span.className = "cell-text";
          span.textContent = text;

          td.appendChild(barEl);
          td.appendChild(span);
        } else {
          td.textContent = text;
        }
      }

      tr.appendChild(td);
    }

    tbody.appendChild(tr);
  }

  table.appendChild(tbody);
  view.appendChild(table);
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

function buildLayout(
  spec: LayoutSpec,
  viewById: Map<string, CalcdownView>,
  ctx: { values: Record<string, unknown>; chartMode: ChartMode; schemas?: Record<string, DataTable>; onEditTableCell?: (ev: TableEditEvent) => void }
): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "view";
  if (spec.title) wrapper.appendChild(viewTitle(spec.title));

  const container = buildLayoutContainer(spec);
  for (const item of spec.items) {
    const el = buildLayoutItem(item, viewById, ctx);
    if (el) container.appendChild(el);
  }
  wrapper.appendChild(container);
  return wrapper;
}

function buildMissingView(ref: string): HTMLElement {
  const missing = document.createElement("div");
  missing.className = "view";
  missing.appendChild(viewTitle(`Missing view: ${ref}`));
  return missing;
}

function buildLayoutItem(
  item: LayoutItem,
  viewById: Map<string, CalcdownView>,
  ctx: {
    values: Record<string, unknown>;
    chartMode: ChartMode;
    schemas?: Record<string, DataTable>;
    valueTypes?: Record<string, InputType>;
    onEditTableCell?: (ev: TableEditEvent) => void;
  }
): HTMLElement | null {
  if (item.kind === "layout") return buildLayout(item.spec, viewById, ctx);

  const target = viewById.get(item.ref);
  if (!target) return buildMissingView(item.ref);
  if (!isViewVisible(target, ctx.values)) return null;

  if (target.type === "cards") {
    const title = target.spec.title ?? null;
    return buildCardsView(title, target.spec.items as CardsViewSpecItem[], ctx.values, ctx.valueTypes);
  }

  if (target.type === "table") {
    const sourceName = target.source;
    const raw = ctx.values[sourceName];
    if (!Array.isArray(raw)) return null;
    const rowObjs = raw.filter((r) => r && typeof r === "object" && !Array.isArray(r)) as Record<string, unknown>[];

    const schema = ctx.schemas ? ctx.schemas[sourceName] : undefined;
    const schemaCols = schema?.columns ?? null;

    const cols = (target.spec.columns && target.spec.columns.length ? target.spec.columns : defaultColumnsForSource(sourceName, rowObjs, ctx.schemas)).map((c) => {
      const fmtRaw = c.format ? (c.format as ValueFormat) : undefined;
      const fmt = resolveFormat(fmtRaw, schemaCols ? schemaCols[c.key] : undefined);
      const dataBar = c.dataBar;
      const conditionalFormat = c.conditionalFormat;
      return Object.assign(
        Object.create(null),
        { key: c.key, label: c.label },
        fmt ? { format: fmt } : {},
        dataBar ? { dataBar } : {},
        conditionalFormat ? { conditionalFormat } : {}
      );
    });

    const editable = Boolean(target.spec.editable && schema && !schema.source);

    const limit = target.spec.limit;
    const limitedRows = limit !== undefined ? rowObjs.slice(0, limit) : rowObjs;
    const title = target.spec.title ?? null;

    const tableOpts: { editable: boolean; schema?: DataTable; onEditTableCell?: (ev: TableEditEvent) => void } = { editable };
    if (schema) tableOpts.schema = schema;
    if (ctx.onEditTableCell) tableOpts.onEditTableCell = ctx.onEditTableCell;
    return buildTableView(title, sourceName, cols, limitedRows, tableOpts);
  }

  if (target.type === "chart") {
    const sourceName = target.source;
    const raw = ctx.values[sourceName];
    if (!Array.isArray(raw)) return null;
    const rows = raw.filter((r) => r && typeof r === "object" && !Array.isArray(r)) as Record<string, unknown>[];
    const xField = target.spec.x.key;
    const ySpecs = Array.isArray(target.spec.y) ? target.spec.y : [target.spec.y];

    const schema = ctx.schemas ? ctx.schemas[sourceName] : undefined;
    const schemaCols = schema?.columns ?? null;

    const series: ChartSeriesSpec[] = ySpecs.map((s) => {
      const fmtRaw = s.format ? (s.format as ValueFormat) : undefined;
      const fmt = resolveFormat(fmtRaw, schemaCols ? schemaCols[s.key] : undefined);
      const kind = s.kind === "line" || s.kind === "bar" ? s.kind : undefined;
      const area = s.area === true ? true : undefined;
      return Object.assign(Object.create(null), { key: s.key, label: s.label }, fmt ? { format: fmt } : {}, kind ? { kind } : {}, area ? { area } : {});
    });
    const title = target.spec.title ?? target.id;
    const mark = ctx.chartMode === "spec" ? target.spec.kind : ctx.chartMode;

    const classes: Partial<ChartCardClasses> = Object.assign(Object.create(null), { container: "view view-chart", title: "view-title", subtitle: "muted" });
    const xFormat = resolveFormat(
      target.spec.x.format ? (target.spec.x.format as ValueFormat) : undefined,
      schemaCols ? schemaCols[xField] : undefined
    );

    const chartOpts = {
      title,
      rows,
      xField,
      xLabel: target.spec.x.label,
      series,
      classes,
      ...(xFormat ? { xFormat } : {}),
    };
    if (mark === "line") return buildLineChartCard(chartOpts);
    if (mark === "bar") return buildBarChartCard(chartOpts);
    if (mark === "combo") return buildComboChartCard(chartOpts);
    return null;
  }

  if (target.type === "layout") return buildLayout(target.spec, viewById, ctx);

  return null;
}

export function renderCalcdownViews(opts: RenderViewsOptions): void {
  const chartMode: ChartMode = opts.chartMode ?? "spec";
  clear(opts.container);
  if (opts.views.length === 0) return;

  const viewById = new Map(opts.views.map((v) => [v.id, v]));
  const rootLayout = opts.views.find((v) => v.type === "layout" && isViewVisible(v, opts.values)) ?? null;

  const ctx: {
    values: Record<string, unknown>;
    chartMode: ChartMode;
    schemas?: Record<string, DataTable>;
    valueTypes?: Record<string, InputType>;
    onEditTableCell?: (ev: TableEditEvent) => void;
  } = { values: opts.values, chartMode };
  if (opts.tableSchemas) ctx.schemas = opts.tableSchemas;
  if (opts.valueTypes) ctx.valueTypes = opts.valueTypes;
  if (opts.onEditTableCell) ctx.onEditTableCell = opts.onEditTableCell;

  if (rootLayout && rootLayout.type === "layout") {
    opts.container.appendChild(buildLayout(rootLayout.spec, viewById, ctx));
    return;
  }

  for (const v of opts.views) {
    if (v.type === "layout") continue;
    if (!isViewVisible(v, opts.values)) continue;
    const el = buildLayoutItem({ kind: "ref", ref: v.id }, viewById, ctx);
    if (el) opts.container.appendChild(el);
  }
}

export function renderCalcdownViewsInline(opts: RenderInlineViewsOptions): void {
  const chartMode: ChartMode = opts.chartMode ?? "spec";
  clear(opts.container);
  if (opts.views.length === 0) return;

  const viewById = new Map(opts.views.map((v) => [v.id, v]));

  const ctx: {
    values: Record<string, unknown>;
    chartMode: ChartMode;
    schemas?: Record<string, DataTable>;
    valueTypes?: Record<string, InputType>;
    onEditTableCell?: (ev: TableEditEvent) => void;
  } = { values: opts.values, chartMode };
  if (opts.tableSchemas) ctx.schemas = opts.tableSchemas;
  if (opts.valueTypes) ctx.valueTypes = opts.valueTypes;
  if (opts.onEditTableCell) ctx.onEditTableCell = opts.onEditTableCell;

  for (const id of opts.render) {
    const el = buildLayoutItem({ kind: "ref", ref: id }, viewById, ctx);
    if (el) opts.container.appendChild(el);
  }
}
