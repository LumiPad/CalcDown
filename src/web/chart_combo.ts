/**
 * Purpose: Render combo (bar + line) chart view data into an SVG chart card.
 * Intent: Provide a dependency-free mixed-mark chart for common finance dashboards.
 */

import { clamp, monotoneCubicPath, niceTicks } from "./chart_math.js";
import { appendChartLegend } from "./chart_legend.js";
import {
  DEFAULT_CHART_MARKER_RADIUS,
  DEFAULT_CHART_MARKER_MAX_POINTS,
  DEFAULT_CHART_SERIES_STROKE_WIDTH,
  DEFAULT_SERIES_COLORS,
  asNumber,
  axisFormatFromSeries,
  buildHeader,
  formatCategoryLabel,
  formatTick,
  formatXTick,
  seriesFromOptions,
} from "./chart_shared.js";
import type { ChartCardOptions, ChartSeriesSpec } from "./chart_types.js";

export function buildComboChartCard(opts: ChartCardOptions): HTMLElement {
  const view = buildHeader(opts);
  const inputSeries = seriesFromOptions(opts);
  if (inputSeries.length < 2) {
    const msg = document.createElement("div");
    msg.textContent = "Combo chart requires at least 2 y series.";
    view.appendChild(msg);
    return view;
  }

  const series = inputSeries.map((s, idx) => {
    const kind = s.kind ?? (idx === 0 ? "bar" : "line");
    return Object.assign(Object.create(null), s, { kind }) as ChartSeriesSpec;
  });

  const barSeries: { seriesIndex: number; spec: ChartSeriesSpec; color: string; label: string }[] = [];
  const lineSeries: { seriesIndex: number; spec: ChartSeriesSpec; color: string; label: string }[] = [];
  for (let i = 0; i < series.length; i++) {
    const s = series[i]!;
    const label = (s.label ?? s.key).trim() || s.key;
    const color = s.color ?? DEFAULT_SERIES_COLORS[i % DEFAULT_SERIES_COLORS.length]!;
    if (s.kind === "bar") barSeries.push({ seriesIndex: i, spec: s, color, label });
    else lineSeries.push({ seriesIndex: i, spec: s, color, label });
  }

  const categories: { label: string; ys: (number | null)[] }[] = [];
  for (const row of opts.rows) {
    const ys = series.map((s) => asNumber(row[s.key]));
    if (ys.every((v) => v === null)) continue;
    categories.push({ label: formatCategoryLabel(row[opts.xField], opts.xFormat), ys });
  }

  if (categories.length < 1) {
    const msg = document.createElement("div");
    msg.textContent = `Not enough data to plot series by ${opts.xField}.`;
    view.appendChild(msg);
    return view;
  }

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
  if (!found) {
    const msg = document.createElement("div");
    msg.textContent = `Not enough data to plot series by ${opts.xField}.`;
    view.appendChild(msg);
    return view;
  }
  if (ymax === ymin) ymax = ymin + 1;

  const allNonNegative = ymin >= 0;
  const allNonPositive = ymax <= 0;
  if (allNonNegative) ymin = 0;
  if (allNonPositive) ymax = 0;

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

  const bandW = plotW / categories.length;
  const sx = (i: number) => margin.left + i * bandW + bandW / 2;
  const sy = (y: number) => margin.top + plotH - ((y - ymin) / (ymax - ymin)) * plotH;
  const y0 = sy(0);

  const xTickMax = clamp(Math.floor(plotW / 60), 2, 12);
  const labelEvery = Math.max(1, Math.ceil(categories.length / xTickMax));
  const xTicks: number[] = [];
  for (let i = 0; i < categories.length; i += labelEvery) xTicks.push(i);
  if (xTicks.length === 0 || xTicks[xTicks.length - 1] !== categories.length - 1) xTicks.push(categories.length - 1);

  const categoryLabels = new Map<number, string>(categories.map((c, idx) => [idx, c.label]));

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

  if (barSeries.length > 0) {
    const groupBand = bandW;
    const seriesBand = groupBand / barSeries.length;
    const barW = Math.max(2, seriesBand * 0.7);
    const barXInset = (seriesBand - barW) / 2;

    for (let i = 0; i < categories.length; i++) {
      const c = categories[i]!;
      const groupX0 = margin.left + i * bandW;
      for (let bi = 0; bi < barSeries.length; bi++) {
        const bs = barSeries[bi]!;
        const yv = c.ys[bs.seriesIndex] ?? null;
        if (yv === null) continue;

        const x = groupX0 + bi * seriesBand + barXInset;
        const y = sy(yv);
        const yTop = Math.min(y, y0);
        const h = Math.abs(y - y0);

        const rect = document.createElementNS(svgNS, "rect");
        rect.setAttribute("x", x.toFixed(2));
        rect.setAttribute("y", yTop.toFixed(2));
        rect.setAttribute("width", barW.toFixed(2));
        rect.setAttribute("height", h.toFixed(2));
        rect.setAttribute("fill", bs.color);
        rect.setAttribute("fill-opacity", "0.28");
        rect.setAttribute("stroke", bs.color);
        rect.setAttribute("stroke-width", String(DEFAULT_CHART_SERIES_STROKE_WIDTH));
        rect.setAttribute("rx", "3");
        svg.appendChild(rect);
      }
    }
  }

  for (const ls of lineSeries) {
    const points: { x: number; y: number; idx: number }[] = [];
    for (let i = 0; i < categories.length; i++) {
      const yv = categories[i]!.ys[ls.seriesIndex] ?? null;
      if (yv === null) continue;
      points.push({ x: sx(i), y: sy(yv), idx: i });
    }
    if (points.length < 2) continue;

    const pixelPoints = points.map((p) => ({ x: p.x, y: p.y }));

    const path = document.createElementNS(svgNS, "path");
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", ls.color);
    path.setAttribute("stroke-width", String(DEFAULT_CHART_SERIES_STROKE_WIDTH));
    path.setAttribute("stroke-linejoin", "round");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("d", monotoneCubicPath(pixelPoints));
    svg.appendChild(path);

    const markerIdx = points.length > DEFAULT_CHART_MARKER_MAX_POINTS ? new Set(xTicks) : null;
    if (markerIdx) {
      markerIdx.add(points[0]!.idx);
      markerIdx.add(points[points.length - 1]!.idx);
    }

    for (let pi = 0; pi < points.length; pi++) {
      const src = points[pi]!;
      if (markerIdx && !markerIdx.has(src.idx)) continue;
      const pt = pixelPoints[pi]!;
      const dot = document.createElementNS(svgNS, "circle");
      dot.setAttribute("cx", pt.x.toFixed(2));
      dot.setAttribute("cy", pt.y.toFixed(2));
      dot.setAttribute("r", String(DEFAULT_CHART_MARKER_RADIUS));
      dot.setAttribute("fill", "#fff");
      dot.setAttribute("stroke", ls.color);
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
    tick.setAttribute(
      "d",
      `M ${x.toFixed(2)} ${(margin.top + plotH).toFixed(2)} L ${x.toFixed(2)} ${(margin.top + plotH + 4).toFixed(2)}`
    );
    svg.appendChild(tick);

    const label = document.createElementNS(svgNS, "text");
    label.setAttribute("x", x.toFixed(2));
    label.setAttribute("y", String(margin.top + plotH + 18));
    label.setAttribute("fill", "#6a718a");
    label.setAttribute("font-size", "10");
    label.setAttribute("text-anchor", "middle");
    label.textContent = formatXTick(tx, opts, false, categoryLabels);
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
    series.map((s, si) => ({
      label: (s.label ?? s.key).trim() || s.key,
      color: s.color ?? DEFAULT_SERIES_COLORS[si % DEFAULT_SERIES_COLORS.length]!,
    }))
  );

  return view;
}
