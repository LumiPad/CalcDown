/**
 * Purpose: Render chart view data into lightweight SVG/HTML charts.
 * Intent: Provide deterministic browser chart output without heavy dependencies.
 */

export type { ChartCardClasses, ChartCardOptions, ChartSeriesSpec } from "./chart_types.js";

import { clamp, monotoneCubicPath, niceTicks, pickXTicks, uniqueSortedNumbers } from "./chart_math.js";
import { appendChartLegend } from "./chart_legend.js";
import {
  DEFAULT_SERIES_COLORS,
  DEFAULT_CHART_MARKER_RADIUS,
  DEFAULT_CHART_MARKER_MAX_POINTS,
  DEFAULT_CHART_SERIES_STROKE_WIDTH,
  asNumber,
  axisFormatFromSeries,
  buildHeader,
  formatCategoryLabel,
  formatTick,
  formatXTick,
  seriesFromOptions,
} from "./chart_shared.js";
import type { ChartCardOptions, ChartSeriesSpec } from "./chart_types.js";

export { buildComboChartCard } from "./chart_combo.js";

export function buildLineChartCard(opts: ChartCardOptions): HTMLElement {
  const view = buildHeader(opts);
  const series = seriesFromOptions(opts);
  if (series.length === 0) {
    const msg = document.createElement("div");
    msg.textContent = "Chart is missing required y series.";
    view.appendChild(msg);
    return view;
  }

  const xNumbersByRow = opts.rows.map((r) => asNumber(r[opts.xField]));
  const useCategoryIndex = xNumbersByRow.every((x) => x === null);
  const xCategoryLabels = useCategoryIndex
    ? new Map<number, string>(
        opts.rows.map((row, idx) => [idx, formatCategoryLabel(row[opts.xField], opts.xFormat)])
      )
    : undefined;
  const xIsDate = !useCategoryIndex && opts.rows.some((r) => r[opts.xField] instanceof Date);

  const seriesPoints: { spec: ChartSeriesSpec; points: { x: number; y: number }[] }[] = [];
  const allPoints: { x: number; y: number }[] = [];

  for (const s of series) {
    const points: { x: number; y: number }[] = [];
    for (let rowIndex = 0; rowIndex < opts.rows.length; rowIndex++) {
      const row = opts.rows[rowIndex]!;
      const x = useCategoryIndex ? rowIndex : asNumber(row[opts.xField]);
      const y = asNumber(row[s.key]);
      if (x === null || y === null) continue;
      points.push({ x, y });
      allPoints.push({ x, y });
    }
    if (points.length) seriesPoints.push({ spec: s, points });
  }

  if (allPoints.length < 2) {
    const msg = document.createElement("div");
    msg.textContent = `Not enough data to plot series over ${opts.xField}.`;
    view.appendChild(msg);
    return view;
  }

  for (const sp of seriesPoints) sp.points.sort((a, b) => a.x - b.x);

  let xmin = allPoints[0]!.x;
  let xmax = allPoints[0]!.x;
  let ymin = allPoints[0]!.y;
  let ymax = allPoints[0]!.y;
  for (const p of allPoints) {
    xmin = Math.min(xmin, p.x);
    xmax = Math.max(xmax, p.x);
    ymin = Math.min(ymin, p.y);
    ymax = Math.max(ymax, p.y);
  }
  if (xmax === xmin) xmax = xmin + 1;
  if (ymax === ymin) ymax = ymin + 1;

  // Prefer a baseline at 0 when the series doesn't cross it (common for finance charts).
  const allNonNegative = ymin >= 0;
  const allNonPositive = ymax <= 0;
  if (allNonNegative) ymin = 0;
  if (allNonPositive) ymax = 0;

  // Add a little headroom so strokes/markers don't hug the border.
  const yPad = (ymax - ymin) * 0.06;
  if (Number.isFinite(yPad) && yPad > 0) {
    if (allNonNegative) {
      ymax += yPad;
    } else if (allNonPositive) {
      ymin -= yPad;
    } else {
      ymin -= yPad;
      ymax += yPad;
    }
  }

  const width = 720;
  const height = 260;
  const margin = { top: 12, right: 14, bottom: 42, left: 54 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;

  const yTicks = niceTicks(ymin, ymax, 5);
  ymin = yTicks.min;
  ymax = yTicks.max;

  const sx = (x: number) => margin.left + ((x - xmin) / (xmax - xmin)) * plotW;
  const sy = (y: number) => margin.top + plotH - ((y - ymin) / (ymax - ymin)) * plotH;

  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", String(height));
  svg.style.display = "block";

  const xTickMax = clamp(Math.floor(plotW / 60), 2, 12);
  const xTicks = pickXTicks(uniqueSortedNumbers(allPoints.map((p) => p.x)), xTickMax);

  const grid = document.createElementNS(svgNS, "path");
  grid.setAttribute("fill", "none");
  grid.setAttribute("stroke", "#eef0f6");
  grid.setAttribute("stroke-width", "1");
  grid.setAttribute("stroke-dasharray", "3 3");
  const gridLines: string[] = [];
  for (const v of yTicks.ticks) {
    const y = sy(v);
    gridLines.push(`M ${margin.left} ${y.toFixed(2)} L ${(margin.left + plotW).toFixed(2)} ${y.toFixed(2)}`);
  }
  grid.setAttribute("d", gridLines.join(" "));
  svg.appendChild(grid);

  const vgrid = document.createElementNS(svgNS, "path");
  vgrid.setAttribute("fill", "none");
  vgrid.setAttribute("stroke", "#f4f5fa");
  vgrid.setAttribute("stroke-width", "1");
  vgrid.setAttribute("stroke-dasharray", "3 3");
  const vgridLines: string[] = [];
  for (const tx of xTicks) {
    const x = sx(tx);
    vgridLines.push(`M ${x.toFixed(2)} ${margin.top.toFixed(2)} L ${x.toFixed(2)} ${(margin.top + plotH).toFixed(2)}`);
  }
  vgrid.setAttribute("d", vgridLines.join(" "));
  svg.appendChild(vgrid);

  const axis = document.createElementNS(svgNS, "path");
  axis.setAttribute("fill", "none");
  axis.setAttribute("stroke", "#c9cedf");
  axis.setAttribute("stroke-width", "1");
  axis.setAttribute(
    "d",
    `M ${margin.left} ${margin.top} L ${margin.left} ${margin.top + plotH} L ${margin.left + plotW} ${margin.top + plotH}`
  );
  svg.appendChild(axis);

  const yAxisFormat = axisFormatFromSeries(series);
  for (const v of yTicks.ticks) {
    const y = sy(v);
    const label = document.createElementNS(svgNS, "text");
    label.setAttribute("x", String(margin.left - 8));
    label.setAttribute("y", y.toFixed(2));
    label.setAttribute("fill", "#6a718a");
    label.setAttribute("font-size", "10");
    label.setAttribute("text-anchor", "end");
    label.setAttribute("dominant-baseline", "central");
    label.textContent = formatTick(v, yAxisFormat, yTicks.step);
    svg.appendChild(label);
  }

  for (let si = 0; si < seriesPoints.length; si++) {
    const sp = seriesPoints[si]!;
    const color = sp.spec.color ?? DEFAULT_SERIES_COLORS[si % DEFAULT_SERIES_COLORS.length]!;

    const pixelPoints = sp.points.map((p) => ({ x: sx(p.x), y: sy(p.y) }));
    const curveD = monotoneCubicPath(pixelPoints);

    const wantsArea = seriesPoints.length === 1 && sp.spec.area === true && pixelPoints.length >= 2;
    if (wantsArea) {
      const baseY = sy(0);
      const first = pixelPoints[0]!;
      const last = pixelPoints[pixelPoints.length - 1]!;
      const curveTail = curveD.replace(/^M\s+-?\d+(?:\.\d+)?\s+-?\d+(?:\.\d+)?/, "");

      const area = document.createElementNS(svgNS, "path");
      area.setAttribute("fill", color);
      area.setAttribute("fill-opacity", "0.12");
      area.setAttribute("stroke", "none");
      area.setAttribute(
        "d",
        `M ${first.x.toFixed(2)} ${baseY.toFixed(2)} L ${first.x.toFixed(2)} ${first.y.toFixed(2)}${curveTail} L ${last.x.toFixed(2)} ${baseY.toFixed(2)} L ${first.x.toFixed(2)} ${baseY.toFixed(2)} Z`
      );
      svg.appendChild(area);
    }

    const path = document.createElementNS(svgNS, "path");
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", color);
    path.setAttribute("stroke-width", String(DEFAULT_CHART_SERIES_STROKE_WIDTH));
    path.setAttribute("stroke-linejoin", "round");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("d", curveD);
    svg.appendChild(path);

    const markerX = pixelPoints.length > DEFAULT_CHART_MARKER_MAX_POINTS ? new Set(xTicks) : null;
    if (markerX) {
      markerX.add(sp.points[0]!.x);
      markerX.add(sp.points[sp.points.length - 1]!.x);
    }

    for (let pi = 0; pi < pixelPoints.length; pi++) {
      if (markerX && !markerX.has(sp.points[pi]!.x)) continue;
      const pt = pixelPoints[pi]!;
      const dot = document.createElementNS(svgNS, "circle");
      dot.setAttribute("cx", pt.x.toFixed(2));
      dot.setAttribute("cy", pt.y.toFixed(2));
      dot.setAttribute("r", String(DEFAULT_CHART_MARKER_RADIUS));
      dot.setAttribute("fill", "#fff");
      dot.setAttribute("stroke", color);
      dot.setAttribute("stroke-width", String(DEFAULT_CHART_SERIES_STROKE_WIDTH));
      svg.appendChild(dot);
    }
  }

  for (const tx of xTicks) {
    const x = sx(tx);

    const tick = document.createElementNS(svgNS, "path");
    tick.setAttribute("fill", "none");
    tick.setAttribute("stroke", "#c9cedf");
    tick.setAttribute("stroke-width", "1");
    tick.setAttribute("d", `M ${x.toFixed(2)} ${(margin.top + plotH).toFixed(2)} L ${x.toFixed(2)} ${(margin.top + plotH + 4).toFixed(2)}`);
    svg.appendChild(tick);

    const label = document.createElementNS(svgNS, "text");
    label.setAttribute("x", x.toFixed(2));
    label.setAttribute("y", String(margin.top + plotH + 18));
    label.setAttribute("fill", "#6a718a");
    label.setAttribute("font-size", "10");
    label.setAttribute("text-anchor", "middle");
    label.textContent = formatXTick(tx, opts, xIsDate, xCategoryLabels);
    svg.appendChild(label);
  }

  const xAxisLabel = (opts.xLabel ?? "").trim() || opts.xField;
  const xLabel = document.createElementNS(svgNS, "text");
  xLabel.setAttribute("x", String(margin.left + plotW));
  xLabel.setAttribute("y", String(margin.top + plotH + 34));
  xLabel.setAttribute("fill", "#6a718a");
  xLabel.setAttribute("font-size", "10");
  xLabel.setAttribute("text-anchor", "end");
  xLabel.textContent = xAxisLabel;
  svg.appendChild(xLabel);

  view.appendChild(svg);

  appendChartLegend(
    view,
    seriesPoints.map((sp, si) => ({
      label: (sp.spec.label ?? sp.spec.key).trim() || sp.spec.key,
      color: sp.spec.color ?? DEFAULT_SERIES_COLORS[si % DEFAULT_SERIES_COLORS.length]!,
    }))
  );

  return view;
}

export function buildBarChartCard(opts: ChartCardOptions): HTMLElement {
  const view = buildHeader(opts);
  const series = seriesFromOptions(opts);
  if (series.length === 0) {
    const msg = document.createElement("div");
    msg.textContent = "Chart is missing required y series.";
    view.appendChild(msg);
    return view;
  }

  const categories: { label: string; ys: (number | null)[] }[] = [];
  for (const row of opts.rows) {
    const label = formatCategoryLabel(row[opts.xField], opts.xFormat);
    const ys = series.map((s) => asNumber(row[s.key]));
    if (ys.every((v) => v === null)) continue;
    categories.push({ label, ys });
  }

  if (categories.length < 1) {
    const msg = document.createElement("div");
    msg.textContent = `Not enough data to plot series by ${opts.xField}.`;
    view.appendChild(msg);
    return view;
  }

  const width = 720;
  const height = 260;
  const margin = { top: 12, right: 14, bottom: 42, left: 54 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;

  let ymin = 0;
  let ymax = 0;
  let found = false;
  for (const c of categories) {
    for (const y of c.ys) {
      if (y === null) continue;
      if (!found) {
        ymin = y;
        ymax = y;
        found = true;
        continue;
      }
      ymin = Math.min(ymin, y);
      ymax = Math.max(ymax, y);
    }
  }
  if (ymax === ymin) ymax = ymin + 1;

  // Include 0 so bar charts get a meaningful baseline.
  const allNonNegative = ymin >= 0;
  const allNonPositive = ymax <= 0;
  ymin = Math.min(ymin, 0);
  ymax = Math.max(ymax, 0);

  const yPad = (ymax - ymin) * 0.06;
  if (Number.isFinite(yPad) && yPad > 0) {
    if (allNonNegative) {
      ymax += yPad;
    } else if (allNonPositive) {
      ymin -= yPad;
    } else {
      ymin -= yPad;
      ymax += yPad;
    }
  }

  const yTicks = niceTicks(ymin, ymax, 5);
  ymin = yTicks.min;
  ymax = yTicks.max;

  const groupBand = plotW / categories.length;
  const seriesBand = groupBand / series.length;
  const barW = Math.max(2, seriesBand * 0.7);
  const groupX0 = margin.left;
  const barXInset = (seriesBand - barW) / 2;
  const sy = (y: number) => margin.top + plotH - ((y - ymin) / (ymax - ymin)) * plotH;
  const y0 = sy(0);

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
  grid.setAttribute("stroke-dasharray", "3 3");
  const gridLines: string[] = [];
  for (const v of yTicks.ticks) {
    const y = sy(v);
    gridLines.push(`M ${margin.left} ${y.toFixed(2)} L ${(margin.left + plotW).toFixed(2)} ${y.toFixed(2)}`);
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

  const yAxisFormat = axisFormatFromSeries(series);
  for (const v of yTicks.ticks) {
    const y = sy(v);
    const label = document.createElementNS(svgNS, "text");
    label.setAttribute("x", String(margin.left - 8));
    label.setAttribute("y", y.toFixed(2));
    label.setAttribute("fill", "#6a718a");
    label.setAttribute("font-size", "10");
    label.setAttribute("text-anchor", "end");
    label.setAttribute("dominant-baseline", "central");
    label.textContent = formatTick(v, yAxisFormat, yTicks.step);
    svg.appendChild(label);
  }

  for (let i = 0; i < categories.length; i++) {
    const c = categories[i]!;
    const groupX = groupX0 + i * groupBand;
    for (let si = 0; si < series.length; si++) {
      const s = series[si]!;
      const yv = c.ys[si] ?? null;
      if (yv === null) continue;
      const color = s.color ?? DEFAULT_SERIES_COLORS[si % DEFAULT_SERIES_COLORS.length]!;

      const x = groupX + si * seriesBand + barXInset;
      const y = sy(yv);
      const yTop = Math.min(y, y0);
      const h = Math.abs(y - y0);

      const rect = document.createElementNS(svgNS, "rect");
      rect.setAttribute("x", x.toFixed(2));
      rect.setAttribute("y", yTop.toFixed(2));
      rect.setAttribute("width", barW.toFixed(2));
      rect.setAttribute("height", h.toFixed(2));
      rect.setAttribute("fill", color);
      rect.setAttribute("fill-opacity", "0.28");
      rect.setAttribute("stroke", color);
      rect.setAttribute("stroke-width", String(DEFAULT_CHART_SERIES_STROKE_WIDTH));
      rect.setAttribute("rx", "3");
      svg.appendChild(rect);
    }
  }

  const labelEvery = Math.max(1, Math.ceil(categories.length / clamp(Math.floor(plotW / 60), 2, 12)));
  for (let i = 0; i < categories.length; i += labelEvery) {
    const c = categories[i]!;
    const cx = groupX0 + i * groupBand + groupBand / 2;
    const tx = document.createElementNS(svgNS, "text");
    tx.setAttribute("x", cx.toFixed(2));
    tx.setAttribute("y", String(margin.top + plotH + 22));
    tx.setAttribute("fill", "#6a718a");
    tx.setAttribute("font-size", "10");
    tx.setAttribute("text-anchor", "middle");
    tx.textContent = c.label;
    svg.appendChild(tx);
  }

  view.appendChild(svg);

  appendChartLegend(
    view,
    series.map((s, si) => ({
      label: (s.label ?? s.key).trim() || s.key,
      color: s.color ?? DEFAULT_SERIES_COLORS[si % DEFAULT_SERIES_COLORS.length]!,
    }))
  );

  return view;
}
