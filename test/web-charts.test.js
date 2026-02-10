import assert from "node:assert/strict";
import { test } from "node:test";

import {
  clamp,
  decimalsForStep,
  monotoneCubicPath,
  niceTicks,
  pickXTicks,
  uniqueSortedNumbers,
} from "../dist/web/chart_math.js";
import {
  asNumber,
  axisFormatFromSeries,
  buildHeader,
  formatTick,
  formatXTick,
  seriesFromOptions,
} from "../dist/web/chart_shared.js";
import { appendChartLegend } from "../dist/web/chart_legend.js";
import { buildBarChartCard, buildComboChartCard, buildLineChartCard } from "../dist/web/charts.js";

import { FakeDocument, nodesByTag, withFakeDom } from "./fake_dom.js";

test("web chart_math: helpers cover edge cases and monotone fallback paths", () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-1, 0, 10), 0);
  assert.equal(clamp(99, 0, 10), 10);

  assert.equal(decimalsForStep(0), 0);
  assert.equal(decimalsForStep(Number.NaN), 0);
  assert.equal(decimalsForStep(0.25), 2);
  assert.equal(decimalsForStep(0.1), 1);
  assert.equal(decimalsForStep(1 / 3), 2);
  assert.equal(decimalsForStep(Math.PI), 0);

  const ticksBad = niceTicks(Number.NaN, 10, 5);
  assert.deepEqual(ticksBad.ticks, [0, 1]);

  const ticksSame0 = niceTicks(0, 0, 5);
  assert.ok(ticksSame0.ticks.length >= 3);
  const ticksSame = niceTicks(10, 10, 5);
  assert.ok(ticksSame.ticks.includes(10));

  const ticks = niceTicks(2, 9, 4);
  assert.ok(ticks.ticks.length >= 2);

  // niceStep: cover raw non-finite + raw==0 and all niceF branches.
  assert.equal(niceTicks(0, 10, Number.NaN).step, 1);
  assert.equal(niceTicks(0, 10, Number.POSITIVE_INFINITY).step, 1);
  assert.equal(niceTicks(0, 1, 2).step, 1);
  assert.equal(niceTicks(0, 1.5, 2).step, 2);
  assert.equal(niceTicks(0, 3, 2).step, 5);
  assert.equal(niceTicks(0, 7, 2).step, 10);

  assert.deepEqual(uniqueSortedNumbers([]), []);
  assert.deepEqual(uniqueSortedNumbers([3, 2, 2, 1]), [1, 2, 3]);

  assert.deepEqual(pickXTicks([], 3), []);
  assert.deepEqual(pickXTicks([1, 2], 3), [1, 2]);
  assert.ok(pickXTicks([1, 2, 3, 4, 5, 6], 3).length <= 3);
  assert.deepEqual(pickXTicks([0, 0, 0, 0, 0], 3), [0]);

  assert.equal(monotoneCubicPath([]), "");
  assert.match(monotoneCubicPath([{ x: 0, y: 1 }]), /^M /);
  assert.match(
    monotoneCubicPath([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ]),
    /^M .* L /
  );

  // Non-monotone x falls back to polyline.
  assert.match(
    monotoneCubicPath([
      { x: 0, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 2 },
    ]),
    /^M .* L .* L /
  );

  // Monotone x produces cubic curve.
  assert.match(
    monotoneCubicPath([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 0 },
      { x: 3, y: 1 },
    ]),
    /\sC\s/
  );
  assert.match(
    monotoneCubicPath([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: 3 },
    ]),
    /\sC\s/
  );

  // Zero-slopes trigger the "m0===0 || m1===0" branch.
  assert.match(
    monotoneCubicPath([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 1 },
      { x: 3, y: 1 },
    ]),
    /\sC\s/
  );
});

test("web chart_shared: numeric coercion, series selection, and formatting", () =>
  withFakeDom(
    () => {
      assert.equal(asNumber(1.25), 1.25);
      assert.equal(asNumber(Number.NaN), null);
      assert.equal(asNumber("3.5"), 3.5);
      assert.equal(asNumber("x"), null);
      assert.equal(asNumber(new Date("2025-01-01T00:00:00Z")), new Date("2025-01-01T00:00:00Z").getTime());
      assert.equal(asNumber({}), null);

      assert.deepEqual(seriesFromOptions({ title: "t", rows: [], xField: "x" }), []);
      assert.equal(
        seriesFromOptions({ title: "t", rows: [], xField: "x", yField: "y", yLabel: "  " })[0].label,
        "y"
      );
      assert.equal(
        seriesFromOptions({ title: "t", rows: [], xField: "x", yField: "y", yLabel: "Revenue" })[0].label,
        "Revenue"
      );
      assert.equal(
        seriesFromOptions({ title: "t", rows: [], xField: "x", yField: "y", yFormat: "percent01" })[0].format,
        "percent01"
      );
      assert.equal(
        seriesFromOptions({ title: "t", rows: [], xField: "x", series: [{ key: "a", label: "A" }] }).length,
        1
      );

      assert.equal(axisFormatFromSeries([{ key: "a" }]), undefined);
      assert.deepEqual(axisFormatFromSeries([{ key: "a", format: "integer" }, { key: "b", format: "integer" }]), "integer");
      assert.equal(axisFormatFromSeries([{ key: "a", format: "integer" }, { key: "b", format: "number" }]), undefined);
      const fmt1 = { kind: "currency", currency: "USD" };
      const fmt2 = { kind: "currency", currency: "USD" };
      assert.equal(axisFormatFromSeries([{ key: "a", format: fmt1 }, { key: "b", format: fmt2 }]), fmt1);
      assert.equal(axisFormatFromSeries([{ key: "a", format: fmt1 }, { key: "b", format: "currency" }]), undefined);
      assert.equal(axisFormatFromSeries([{ key: "a", format: fmt1 }, { key: "b", format: { kind: "currency", currency: "EUR" } }]), undefined);

      assert.equal(formatTick(1.5, undefined, 1), "2");
      assert.equal(formatTick(1.5, undefined, 0.5), "1.5");
      assert.equal(formatTick(1, undefined, 0.1), "1");
      assert.match(formatTick(1, "integer", 1), /^\p{Number}+$/u);

      const categoryLabels = new Map([
        [0, "zero"],
        [1, "one"],
      ]);
      assert.equal(formatXTick(1, { title: "t", rows: [], xField: "x" }, false, categoryLabels), "one");
      assert.equal(formatXTick(1.2, { title: "t", rows: [], xField: "x" }, false, categoryLabels), "one");
      assert.ok(formatXTick(9.9, { title: "t", rows: [], xField: "x", xFormat: "integer" }, false, categoryLabels).length > 0);
      assert.equal(
        formatXTick(new Date("2025-01-01T00:00:00Z").getTime(), { title: "t", rows: [], xField: "x", xFormat: "date" }, true),
        "2025-01-01"
      );
      assert.ok(formatXTick(2, { title: "t", rows: [], xField: "x", xFormat: "integer" }, false).length > 0);

      const header = buildHeader({ title: "Hello", subtitle: "Sub", rows: [], xField: "x" });
      assert.equal(header.children[0].textContent, "Hello");

      const headerNoSub = buildHeader({ title: "Hello", subtitle: "   ", rows: [], xField: "x" });
      assert.equal(headerNoSub.children.length, 1);

      const headerWithClasses = buildHeader({
        title: "Hello",
        subtitle: "Sub",
        rows: [],
        xField: "x",
        classes: { container: "c", title: "t", subtitle: "s" },
      });
      assert.equal(headerWithClasses.className, "c");
      assert.equal(headerWithClasses.children[0].className, "t");
    },
    { document: new FakeDocument() }
  ));

test("web chart legend: appends only when multiple entries", () =>
  withFakeDom(
    () => {
      const view = document.createElement("div");
      appendChartLegend(view, [{ label: "A", color: "#000" }]);
      assert.equal(view.children.length, 0);

      appendChartLegend(view, [
        { label: "A", color: "#000" },
        { label: "B", color: "#111" },
      ]);
      assert.equal(view.children.length, 1);
      assert.ok(view.children[0].className.includes("chart-legend"));
    },
    { document: new FakeDocument() }
  ));

test("web charts: line/bar/combo cards render key branches without throwing", () =>
  withFakeDom(
    () => {
      // Missing series.
      const missing = buildLineChartCard({ title: "t", rows: [], xField: "x" });
      assert.match(missing.textContent, /missing required y series/i);

      // Not enough points.
      const notEnough = buildLineChartCard({
        title: "t",
        rows: [{ x: 1, y: 1 }],
        xField: "x",
        series: [{ key: "y", label: "Y" }],
      });
      assert.match(notEnough.textContent, /Not enough data/i);

      // Category x with area and marker culling.
      const rows = Array.from({ length: 25 }, (_, i) => ({ month: `m${i}`, y: i + 1 }));
      const line = buildLineChartCard({
        title: "t",
        rows,
        xField: "month",
        series: [{ key: "y", label: "Y", area: true }],
      });
      assert.equal(nodesByTag(line, "svg").length, 1);
      assert.ok(nodesByTag(line, "path").length >= 2);

      // Negative-only y triggers the allNonPositive headroom branch.
      const lineNegative = buildLineChartCard({
        title: "t",
        rows: [
          { x: 1, y: -1 },
          { x: 2, y: -2 },
        ],
        xField: "x",
        series: [{ key: "y", label: "Y" }],
      });
      assert.equal(nodesByTag(lineNegative, "svg").length, 1);

      // Crossing zero triggers the mixed-sign headroom branch.
      const lineCross = buildLineChartCard({
        title: "t",
        rows: [
          { x: 1, y: -1 },
          { x: 2, y: 2 },
        ],
        xField: "x",
        series: [{ key: "y", label: "Y" }],
      });
      assert.equal(nodesByTag(lineCross, "svg").length, 1);

      const lineDate = buildLineChartCard({
        title: "t",
        rows: [
          { d: new Date("2025-01-01T00:00:00Z"), y: 1 },
          { d: new Date("2025-02-01T00:00:00Z"), y: 2 },
        ],
        xField: "d",
        series: [{ key: "y", label: "Y" }],
        xFormat: "date",
      });
      assert.equal(nodesByTag(lineDate, "svg").length, 1);

      // Repeated x triggers the xmax===xmin branch.
      const lineSameX = buildLineChartCard({
        title: "t",
        rows: [
          { x: 1, y: 1 },
          { x: 1, y: 2 },
        ],
        xField: "x",
        series: [{ key: "y", label: "Y" }],
      });
      assert.equal(nodesByTag(lineSameX, "svg").length, 1);

      // Repeated y triggers the ymax===ymin branch.
      const lineSameY = buildLineChartCard({
        title: "t",
        rows: [
          { x: 1, y: 1 },
          { x: 2, y: 1 },
        ],
        xField: "x",
        series: [{ key: "y", label: "Y", color: "#000" }],
        xLabel: "X",
      });
      assert.equal(nodesByTag(lineSameY, "svg").length, 1);

      // One empty series exercises the "points.length===0" skip path and legend omission.
      const lineSparseSeries = buildLineChartCard({
        title: "t",
        rows: [
          { x: 1, a: 1, b: null },
          { x: 2, a: 2, b: null },
        ],
        xField: "x",
        series: [
          { key: "a", label: "A" },
          { key: "b", label: "B" },
        ],
      });
      assert.equal(nodesByTag(lineSparseSeries, "svg").length, 1);

      // Mixed x values still use numeric x (non-numeric rows are skipped).
      const lineSkipBadX = buildLineChartCard({
        title: "t",
        rows: [
          { x: 1, y: 1 },
          { x: "bad", y: 2 },
          { x: 2, y: 3 },
        ],
        xField: "x",
        series: [{ key: "y", label: "Y" }],
      });
      assert.equal(nodesByTag(lineSkipBadX, "svg").length, 1);

      // Multiple series with points disables area fill (wantsArea short-circuit).
      const lineTwoSeries = buildLineChartCard({
        title: "t",
        rows: [
          { x: 1, a: 1, b: 2 },
          { x: 2, a: 2, b: 3 },
        ],
        xField: "x",
        series: [
          { key: "a", label: "  ", area: true },
          { key: "b" },
        ],
      });
      assert.equal(nodesByTag(lineTwoSeries, "svg").length, 1);

      // Bar chart not enough categories.
      const barMissing = buildBarChartCard({
        title: "t",
        rows: [{ x: "a", y: null }],
        xField: "x",
        series: [{ key: "y", label: "Y" }],
      });
      assert.match(barMissing.textContent, /Not enough data/i);

      const barNoSeries = buildBarChartCard({ title: "t", rows: [], xField: "x" });
      assert.match(barNoSeries.textContent, /missing required y series/i);

      const bar = buildBarChartCard({
        title: "t",
        rows: [
          { x: "a", y: 1 },
          { x: "b", y: -2 },
        ],
        xField: "x",
        series: [{ key: "y", label: "Y" }],
      });
      assert.equal(nodesByTag(bar, "svg").length, 1);

      // Negative-only y triggers the allNonPositive baseline headroom branch.
      const barNegative = buildBarChartCard({
        title: "t",
        rows: [
          { x: "a", y: -1 },
          { x: "b", y: -2 },
        ],
        xField: "x",
        series: [{ key: "y", label: "Y" }],
      });
      assert.equal(nodesByTag(barNegative, "svg").length, 1);

      // Positive-only bars cover the allNonNegative branch.
      const barPositive = buildBarChartCard({
        title: "t",
        rows: [
          { x: "a", y: 5 },
          { x: "b", y: 5 },
          { x: "c", y: null },
        ],
        xField: "x",
        series: [{ key: "y", label: "Y", color: "#000" }],
      });
      assert.equal(nodesByTag(barPositive, "svg").length, 1);

      // Combo chart requires multiple series.
      const comboMissing = buildComboChartCard({
        title: "t",
        rows: [{ x: "a", a: 1 }],
        xField: "x",
        series: [{ key: "a", label: "A" }],
      });
      assert.match(comboMissing.textContent, /requires at least 2/i);

      const comboNoData = buildComboChartCard({
        title: "t",
        rows: [{ x: "a", a: null, b: null }],
        xField: "x",
        series: [
          { key: "a", label: "A", kind: "bar" },
          { key: "b", label: "B", kind: "line" },
        ],
      });
      assert.match(comboNoData.textContent, /Not enough data/i);

      // Combo chart with only line series avoids the bar rendering branch.
      const combo = buildComboChartCard({
        title: "t",
        rows: [
          { x: "a", a: 1, b: 2 },
          { x: "b", a: 2, b: 1 },
        ],
        xField: "x",
        series: [
          { key: "a", label: "A", kind: "line" },
          { key: "b", label: "B", kind: "line" },
        ],
      });
      assert.equal(nodesByTag(combo, "svg").length, 1);

      // Default kind assignment and label/color fallbacks.
      const comboDefaults = buildComboChartCard({
        title: "t",
        rows: [
          { x: "a", a: 1, b: 2 },
          { x: "b", a: 2, b: 1 },
        ],
        xField: "x",
        xLabel: "X",
        series: [
          { key: "a", label: "  " },
          { key: "b", label: "B", color: "#000" },
        ],
      });
      assert.equal(nodesByTag(comboDefaults, "svg").length, 1);

      // Combo chart with bars and many points triggers marker culling.
      const many = Array.from({ length: 25 }, (_, i) => ({ x: `m${i}`, a: i, b: i }));
      const comboMixed = buildComboChartCard({
        title: "t",
        rows: many,
        xField: "x",
        series: [
          { key: "a", label: "A", kind: "bar" },
          { key: "b", label: "B", kind: "line" },
        ],
      });
      assert.equal(nodesByTag(comboMixed, "svg").length, 1);

      // Negative-only y triggers the allNonPositive headroom branch.
      const comboNegative = buildComboChartCard({
        title: "t",
        rows: [
          { x: "a", a: -1, b: -2 },
          { x: "b", a: -2, b: -3 },
        ],
        xField: "x",
        series: [
          { key: "a", label: "A", kind: "bar" },
          { key: "b", label: "B", kind: "line" },
        ],
      });
      assert.equal(nodesByTag(comboNegative, "svg").length, 1);

      // Mixed-sign data hits the mixed-sign headroom branch.
      const comboCross = buildComboChartCard({
        title: "t",
        rows: [
          { x: "a", a: -1, b: -2 },
          { x: "b", a: 2, b: 3 },
        ],
        xField: "x",
        series: [
          { key: "a", label: "A", kind: "bar", color: "#000" },
          { key: "b", label: "B", kind: "line" },
        ],
      });
      assert.equal(nodesByTag(comboCross, "svg").length, 1);

      // Constant y exercises ymax===ymin.
      const comboFlat = buildComboChartCard({
        title: "t",
        rows: [
          { x: "a", a: 1, b: 1 },
          { x: "b", a: 1, b: 1 },
        ],
        xField: "x",
        series: [
          { key: "a", kind: "bar" },
          { key: "b", kind: "line" },
        ],
      });
      assert.equal(nodesByTag(comboFlat, "svg").length, 1);

      // Ensure we skip rows with all-null ys without dropping the chart.
      const comboSkipNullRows = buildComboChartCard({
        title: "t",
        rows: [
          { x: "a", a: null, b: null },
          { x: "b", a: 1, b: 2 },
        ],
        xField: "x",
        series: [
          { key: "a", kind: "bar" },
          { key: "b", kind: "line" },
        ],
      });
      assert.equal(nodesByTag(comboSkipNullRows, "svg").length, 1);

      // 26 categories forces the "push last xTick" branch.
      const combo26 = buildComboChartCard({
        title: "t",
        rows: Array.from({ length: 26 }, (_, i) => ({ x: `m${i}`, a: i, b: i })),
        xField: "x",
        series: [
          { key: "a", kind: "bar" },
          { key: "b", kind: "line" },
        ],
      });
      assert.equal(nodesByTag(combo26, "svg").length, 1);

      // Multiple bar series + line series with <2 points.
      const comboMultiBars = buildComboChartCard({
        title: "t",
        rows: [
          { x: "a", a: 1, b: 2, c: 1 },
          { x: "b", a: null, b: 3, c: null },
          { x: "c", a: 4, b: null, c: null },
        ],
        xField: "x",
        series: [
          { key: "a", kind: "bar" },
          { key: "b", kind: "bar" },
          { key: "c", kind: "line" },
        ],
      });
      assert.equal(nodesByTag(comboMultiBars, "svg").length, 1);
    },
    { document: new FakeDocument() }
  ));
