import assert from "node:assert/strict";
import { test } from "node:test";

import { parseProgram } from "../dist/index.js";
import { validateViewsFromBlocks } from "../dist/view_contract.js";

function codes(messages) {
  return messages.map((m) => m.code);
}

function validate(markdown) {
  const parsed = parseProgram(markdown);
  return validateViewsFromBlocks(parsed.program.blocks);
}

test("chart views accept combo kind with per-series kind", () => {
  const markdown =
    "---\ncalcdown: 1.0\n---\n\n" +
    "```view\n" +
    JSON.stringify(
      {
        id: "c1",
        library: "calcdown",
        source: "rows",
        type: "chart",
        spec: {
          kind: "combo",
          x: { key: "year" },
          y: [
            { key: "revenue", kind: "bar" },
            { key: "profit", kind: "line" },
          ],
        },
      },
      null,
      2
    ) +
    "\n```\n";

  const res = validate(markdown);
  assert.deepEqual(res.messages, []);
  assert.equal(res.views.length, 1);
  assert.equal(res.views[0]?.type, "chart");
  assert.equal(res.views[0]?.spec.kind, "combo");

  const y = res.views[0]?.spec.y;
  assert.ok(Array.isArray(y));
  assert.equal(y.length, 2);
  assert.equal(y[0]?.kind, "bar");
  assert.equal(y[1]?.kind, "line");
});

test("chart views accept area fill on single-series line charts", () => {
  const markdown =
    "---\ncalcdown: 1.0\n---\n\n" +
    "```view\n" +
    JSON.stringify(
      {
        id: "c2",
        library: "calcdown",
        source: "rows",
        type: "chart",
        spec: {
          kind: "line",
          x: { key: "x" },
          y: { key: "y", area: true },
        },
      },
      null,
      2
    ) +
    "\n```\n";

  const res = validate(markdown);
  assert.deepEqual(res.messages, []);
  assert.equal(res.views.length, 1);
  assert.equal(res.views[0]?.type, "chart");
  assert.equal(res.views[0]?.spec.kind, "line");
  assert.equal(res.views[0]?.spec.y.area, true);
});

test("combo charts require y to be an array with at least 2 series", () => {
  const markdown =
    "---\ncalcdown: 1.0\n---\n\n" +
    "```view\n" +
    JSON.stringify(
      {
        id: "bad_combo_1",
        library: "calcdown",
        source: "rows",
        type: "chart",
        spec: {
          kind: "combo",
          x: { key: "x" },
          y: { key: "y" },
        },
      },
      null,
      2
    ) +
    "\n```\n";

  const res = validate(markdown);
  assert.equal(res.views.length, 0);
  assert.ok(codes(res.messages).includes("CD_VIEW_CHART_COMBO"));
});

test("combo charts reject y arrays with fewer than 2 valid series", () => {
  const markdown =
    "---\ncalcdown: 1.0\n---\n\n" +
    "```view\n" +
    JSON.stringify(
      {
        id: "bad_combo_2",
        library: "calcdown",
        source: "rows",
        type: "chart",
        spec: {
          kind: "combo",
          x: { key: "x" },
          y: [{ key: "y", kind: "bar" }],
        },
      },
      null,
      2
    ) +
    "\n```\n";

  const res = validate(markdown);
  assert.equal(res.views.length, 0);
  assert.ok(codes(res.messages).includes("CD_VIEW_CHART_COMBO"));
});

test("chart axis specs validate series kind and area types", () => {
  const markdown =
    "---\ncalcdown: 1.0\n---\n\n" +
    "```view\n" +
    JSON.stringify(
      [
        {
          id: "bad_series_kind",
          library: "calcdown",
          source: "rows",
          type: "chart",
          spec: {
            kind: "combo",
            x: { key: "x" },
            y: [
              { key: "a", kind: "bar" },
              { key: "b", kind: "nope" },
            ],
          },
        },
        {
          id: "bad_area_type",
          library: "calcdown",
          source: "rows",
          type: "chart",
          spec: {
            kind: "line",
            x: { key: "x" },
            y: { key: "y", area: "yes" },
          },
        },
      ],
      null,
      2
    ) +
    "\n```\n";

  const res = validate(markdown);
  assert.equal(res.views.length, 0);
  assert.ok(codes(res.messages).includes("CD_VIEW_CHART_SERIES_KIND"));
  assert.ok(codes(res.messages).includes("CD_VIEW_CHART_SERIES_AREA"));
});

