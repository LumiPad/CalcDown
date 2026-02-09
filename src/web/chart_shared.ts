/**
 * Purpose: Provide shared helpers for CalcDown chart rendering.
 * Intent: Keep SVG chart implementations small, consistent, and deterministic.
 */

import type { ValueFormat } from "../view_contract.js";
import { formatFormattedValue } from "./format.js";
import { decimalsForStep } from "./chart_math.js";
import type { ChartCardClasses, ChartCardOptions, ChartSeriesSpec } from "./chart_types.js";

export const DEFAULT_SERIES_COLORS = Object.freeze(["#4c6fff", "#22c55e", "#f97316", "#ef4444", "#a855f7", "#06b6d4"]);

export const DEFAULT_CHART_SERIES_STROKE_WIDTH = 1.6;
export const DEFAULT_CHART_MARKER_RADIUS = 2.5;
export const DEFAULT_CHART_MARKER_MAX_POINTS = 20;

const defaultClasses: ChartCardClasses = Object.freeze({
  container: "view",
  title: "view-title",
  subtitle: "muted",
});

export function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  if (v instanceof Date) return v.getTime();
  return null;
}

export function seriesFromOptions(opts: ChartCardOptions): ChartSeriesSpec[] {
  if (opts.series && opts.series.length) return opts.series;
  const key = opts.yField;
  if (!key) return [];
  const label = (opts.yLabel ?? "").trim() || key;
  return [Object.assign(Object.create(null), { key, label, ...(opts.yFormat ? { format: opts.yFormat } : {}) })];
}

export function formatCategoryLabel(v: unknown, fmt: ValueFormat | undefined): string {
  return formatFormattedValue(v, fmt);
}

export function formatXTick(
  x: number,
  opts: ChartCardOptions,
  xIsDate: boolean,
  categoryLabels?: ReadonlyMap<number, string>
): string {
  if (categoryLabels) {
    const exact = categoryLabels.get(x);
    if (exact !== undefined) return exact;
    const rounded = categoryLabels.get(Math.round(x));
    if (rounded !== undefined) return rounded;
  }
  const v: unknown = xIsDate ? new Date(x) : x;
  return formatFormattedValue(v, opts.xFormat);
}

function formatsEqual(a: ValueFormat, b: ValueFormat): boolean {
  if (a === b) return true;
  if (typeof a === "string" || typeof b === "string") return false;
  return a.kind === b.kind && a.digits === b.digits && a.currency === b.currency && a.scale === b.scale;
}

export function axisFormatFromSeries(series: ChartSeriesSpec[]): ValueFormat | undefined {
  let fmt: ValueFormat | undefined;
  for (const s of series) {
    if (!s.format) continue;
    if (!fmt) {
      fmt = s.format;
      continue;
    }
    if (!formatsEqual(fmt, s.format)) return undefined;
  }
  return fmt;
}

function digitsFromStep(step: number): number {
  const digits = decimalsForStep(step);
  if (digits === 0) return 0;
  return digits;
}

export function formatTick(v: number, fmt: ValueFormat | undefined, step: number): string {
  if (fmt) return formatFormattedValue(v, fmt);
  const digits = digitsFromStep(step);
  const txt = v.toFixed(digits);
  if (digits === 0) return txt;
  return txt.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

export function buildHeader(opts: ChartCardOptions): HTMLElement {
  const cls = Object.assign(Object.create(null), defaultClasses, opts.classes ?? {}) as ChartCardClasses;

  const container = document.createElement("div");
  container.className = cls.container;

  const h = document.createElement("div");
  h.className = cls.title;
  h.textContent = opts.title;
  container.appendChild(h);

  const subtitleText = opts.subtitle ?? "";
  if (subtitleText.trim()) {
    const sub = document.createElement("div");
    sub.className = cls.subtitle;
    sub.style.marginBottom = "10px";
    sub.textContent = subtitleText;
    container.appendChild(sub);
  }

  return container;
}
