import assert from "node:assert/strict";
import { test } from "node:test";

import { renderCalcdownViews, renderCalcdownViewsInline } from "../dist/web/render_views.js";

import { FakeDocument, nodesByTag, withFakeDom, walk } from "./fake_dom.js";

function type(name, args = []) {
  return { name, args, raw: args.length ? `${name}(${args.join(",")})` : name };
}

test("web render_views: renders layout/cards/tables/charts with editing, bars, and conditional formats", () =>
  withFakeDom(
    () => {
      const values = {
        revenue: 1234.5,
        deltaPos: 0.1,
        deltaNeg: -0.05,
        deltaZero: 0,
        sparkSeries: Array.from({ length: 100 }, (_, i) => ({ t: i + 1, y: i })),
        sparkShort: [
          { t: 1, y: 1 },
          { t: 2, y: 2 },
        ],
        sparkBad: [{ t: 1, y: 1 }],
        table1: [
          { id: "a", qty: 1, profit: -5, when: "2025-01-01", note: "x", isk: 10.6, badCur: 1.2, curNoCode: 9.9 },
          { id: "b", qty: 2, profit: 10, when: "2025-01-02", note: "y", isk: 12.2, badCur: 2.3, curNoCode: 8.8 },
        ],
        table2: [
          { id: "x", qty: 1, amount: 2.3, note: "ok" },
          { id: "y", qty: 2, amount: 3.4, note: "ok2" },
        ],
        noSchema: [{ a: 1, b: 2 }],
        noSchemaEmpty: [],
        series: [
          { month: new Date("2025-01-01T00:00:00Z"), revenue: 10, cost: 5 },
          { month: new Date("2025-02-01T00:00:00Z"), revenue: 12, cost: -1 },
        ],
      };

      const tableSchemas = {
        table1: {
          name: "table1",
          primaryKey: "id",
          columns: {
            id: type("string"),
            qty: type("integer"),
            profit: type("currency", ["USD"]),
            when: type("date"),
            note: type("string"),
            isk: type("currency", ["ISK"]),
            badCur: type("currency", ["NOPE"]),
            curNoCode: type("currency"),
          },
          rows: [],
          line: 1,
        },
        table2: {
          name: "table2",
          primaryKey: "id",
          columns: {
            id: type("string"),
            qty: type("integer"),
            amount: type("currency", ["USD"]),
            note: type("string"),
          },
          rows: [],
          line: 1,
        },
      };

      const views = [
        {
          id: "layout",
          library: "calcdown",
          type: "layout",
          line: 1,
          spec: {
            title: "Dashboard",
            direction: "row",
            items: [
              { kind: "ref", ref: "summary" },
              { kind: "ref", ref: "tableEditable" },
              { kind: "ref", ref: "tableReadonly" },
              { kind: "ref", ref: "tableFromSchema" },
              { kind: "ref", ref: "chart1" },
              { kind: "ref", ref: "chartCombo" },
              { kind: "ref", ref: "tableNoSchema" },
              { kind: "ref", ref: "tableEmpty" },
              { kind: "ref", ref: "unknown" },
              { kind: "ref", ref: "hidden" },
              { kind: "ref", ref: "visibleParseErr" },
              { kind: "ref", ref: "visibleEvalErr" },
              { kind: "ref", ref: "visibleNonBool" },
              { kind: "layout", spec: { direction: "column", items: [{ kind: "ref", ref: "summary" }] } },
            ],
          },
        },
        {
          id: "summary",
          library: "calcdown",
          type: "cards",
          line: 1,
          spec: {
            title: "Summary",
            items: [
              { key: "revenue", label: "Revenue", format: { kind: "currency", currency: "USD", digits: 0 }, compare: { key: "deltaPos", label: "vs", format: "percent01" } },
              { key: "revenue", label: "Revenue", format: "currency", compare: { key: "deltaNeg", label: "vs", format: "percent01" } },
              { key: "revenue", label: "Revenue", format: "currency", compare: { key: "deltaZero", label: "vs", format: "percent01" } },
              { key: "revenue", label: "Inferred Currency", format: { kind: "currency", digits: 2 } },
              { type: "sparkline", source: "sparkSeries", key: "y", label: "Trend", kind: "line" },
              { type: "sparkline", source: "sparkShort", key: "y", label: "Short", kind: "line" },
              { type: "sparkline", source: "sparkBad", key: "y", label: "Sparse", kind: "line" },
            ],
          },
        },
        {
          id: "tableEditable",
          library: "calcdown",
          type: "table",
          source: "table1",
          line: 1,
          spec: {
            title: "Editable",
            editable: true,
            columns: [
              { key: "qty", label: "Qty", format: "integer" },
              { key: "when", label: "When", format: "date" },
              { key: "note", label: "Note" },
              { key: "isk", label: "ISK", format: { kind: "currency", currency: "ISK", digits: 2 } },
              { key: "badCur", label: "BadCur" },
            ],
          },
        },
        {
          id: "tableReadonly",
          library: "calcdown",
          type: "table",
          source: "table1",
          line: 1,
          spec: {
            title: "Readonly",
            columns: [
              { key: "qty", label: "Qty", dataBar: { color: "#000", max: 10 } },
              {
                key: "profit",
                label: "Profit",
                format: "currency",
                dataBar: { color: " ", max: "auto" },
                conditionalFormat: [
                  { when: "??", style: "warning" },
                  { when: "1 / 0 > 0", style: "warning" },
                  { when: "value < 0", style: "negative" },
                  { when: "value >= 0", style: { fontWeight: "bold", color: "#334155" } },
                ],
              },
              { key: "curNoCode", label: "CurNoCode" },
              { key: "note", label: "Note" },
            ],
          },
        },
        {
          id: "tableFromSchema",
          library: "calcdown",
          type: "table",
          source: "table2",
          line: 1,
          spec: { title: "FromSchema" },
        },
        {
          id: "chart1",
          library: "calcdown",
          type: "chart",
          source: "series",
          line: 1,
          spec: {
            title: "Chart",
            kind: "line",
            x: { key: "month", label: "Month", format: "date" },
            y: { key: "revenue", label: "Revenue", format: { kind: "currency", currency: "USD" } },
          },
        },
        {
          id: "chartCombo",
          library: "calcdown",
          type: "chart",
          source: "series",
          line: 1,
          spec: {
            title: "Combo",
            kind: "combo",
            x: { key: "month", label: "Month", format: "date" },
            y: [
              { key: "revenue", label: "Revenue", kind: "bar" },
              { key: "cost", label: "Cost", kind: "line" },
            ],
          },
        },
        {
          id: "tableNoSchema",
          library: "calcdown",
          type: "table",
          source: "noSchema",
          line: 1,
          spec: { title: "NoSchema" },
        },
        {
          id: "tableEmpty",
          library: "calcdown",
          type: "table",
          source: "noSchemaEmpty",
          line: 1,
          spec: { title: "Empty" },
        },
        {
          id: "hidden",
          library: "calcdown",
          type: "cards",
          visible: "revenue < 0",
          line: 1,
          spec: { title: "Hidden", items: [{ key: "revenue", label: "Revenue" }] },
        },
        {
          id: "visibleParseErr",
          library: "calcdown",
          type: "cards",
          visible: "??",
          line: 1,
          spec: { title: "Parse Visible", items: [{ key: "revenue", label: "Revenue" }] },
        },
        {
          id: "visibleEvalErr",
          library: "calcdown",
          type: "cards",
          visible: "1 / 0 > 0",
          line: 1,
          spec: { title: "Eval Visible", items: [{ key: "revenue", label: "Revenue" }] },
        },
        {
          id: "visibleNonBool",
          library: "calcdown",
          type: "cards",
          visible: "1",
          line: 1,
          spec: { title: "NonBool Visible", items: [{ key: "revenue", label: "Revenue" }] },
        },
        {
          id: "missing",
          library: "calcdown",
          type: "cards",
          line: 1,
          spec: { title: "Missing", items: [] },
        },
        {
          id: "weirdView",
          library: "calcdown",
          type: "weird",
          line: 1,
          spec: {},
        },
      ];

      const container = document.createElement("div");
      const edits = [];

      renderCalcdownViews({
        container,
        views,
        values,
        tableSchemas,
        valueTypes: { revenue: type("currency", ["USD"]) },
        onEditTableCell: (ev) => edits.push(ev),
      });

      // Root layout wraps all rendered content into a single view.
      assert.equal(container.children.length, 1);
      assert.ok(container.textContent.includes("Dashboard"));
      assert.ok(container.textContent.includes("Summary"));
      assert.ok(container.textContent.includes("Editable"));
      assert.ok(container.textContent.includes("Readonly"));
      assert.ok(container.textContent.includes("FromSchema"));
      assert.ok(container.textContent.includes("NoSchema"));
      assert.ok(container.textContent.includes("Empty"));
      assert.ok(!container.textContent.includes("Hidden"));
      assert.ok(container.textContent.includes("Parse Visible"));
      assert.ok(container.textContent.includes("Eval Visible"));
      assert.ok(container.textContent.includes("NonBool Visible"));

      // Missing ref renders a placeholder view.
      assert.ok(container.textContent.includes("Missing view: unknown"));

      // Sparkline appears for dense series.
      const svgs = nodesByTag(container, "svg");
      assert.ok(svgs.length >= 2); // chart + sparkline
      assert.ok(svgs.some((s) => String(s.className).includes("sparkline")));

      // Cards compare classes include all sign variants.
      const deltaClasses = nodesByTag(container, "div")
        .map((n) => n.className)
        .filter((v) => typeof v === "string" && v.includes("delta-"));
      assert.ok(deltaClasses.some((c) => c.includes("delta-positive")));
      assert.ok(deltaClasses.some((c) => c.includes("delta-negative")));
      assert.ok(deltaClasses.some((c) => c.includes("delta-neutral")));

      // Readonly table renders data bars and conditional formatting.
      const tds = nodesByTag(container, "td");
      assert.ok(tds.some((td) => td.className.includes("has-data-bar")));
      assert.ok(tds.some((td) => td.className.includes("cf-negative")));
      assert.ok(tds.some((td) => td.style && td.style.fontWeight === "bold"));

      // Editable table emits edit events.
      const inputs = nodesByTag(container, "input");
      assert.ok(inputs.length > 0);

      const firstNumber = inputs.find((el) => el.type === "number" && el.step === "1");
      assert.ok(firstNumber);
      firstNumber.value = "3.9";
      firstNumber.dispatchFakeEvent("input");

      const iskInput = inputs.find((el) => el.type === "number" && el.value === "10.6");
      assert.ok(iskInput);
      iskInput.value = "10.6";
      iskInput.dispatchFakeEvent("input");

      const date = inputs.find((el) => el.type === "date");
      assert.ok(date);
      date.value = "";
      date.dispatchFakeEvent("input"); // ignored
      date.value = "2025-02-03";
      date.dispatchFakeEvent("input");

      const text = inputs.find((el) => el.type === "text");
      assert.ok(text);
      text.value = "hi";
      text.dispatchFakeEvent("input");

      assert.deepEqual(edits, [
        { tableName: "table1", primaryKey: "a", column: "qty", value: 3 },
        { tableName: "table1", primaryKey: "a", column: "isk", value: 11 },
        { tableName: "table1", primaryKey: "a", column: "when", value: "2025-02-03" },
        { tableName: "table1", primaryKey: "a", column: "note", value: "hi" },
      ]);

      // Inline renderer is deterministic and includes missing placeholders.
      const inline = document.createElement("div");
      renderCalcdownViewsInline({ container: inline, views, render: ["summary", "missing", "unknown"], values });
      assert.ok(inline.textContent.includes("Summary"));
      assert.ok(inline.textContent.includes("Missing"));
      assert.ok(inline.textContent.includes("Missing view: unknown"));

      const weird = document.createElement("div");
      renderCalcdownViewsInline({ container: weird, views, render: ["weirdView"], values });
      assert.equal(weird.children.length, 0);

      const barOnly = document.createElement("div");
      renderCalcdownViews({ container: barOnly, views, values, tableSchemas, chartMode: "bar", onEditTableCell: () => {} });
      assert.ok(nodesByTag(barOnly, "svg").length >= 1);

      const unknownMode = document.createElement("div");
      const chartOnly = views.find((v) => v.id === "chart1");
      assert.ok(chartOnly);
      renderCalcdownViews({ container: unknownMode, views: [chartOnly], values, chartMode: "weird" });
      assert.equal(nodesByTag(unknownMode, "svg").length, 0);

      // Walk sanity: no nodes with undefined textContent.
      assert.ok(walk(container).every((n) => n === null || n === undefined || typeof n.textContent === "string"));
    },
    { document: new FakeDocument() }
  ));

test("web render_views: covers non-layout root, empty views, and editable table edge branches", () =>
  withFakeDom(
    () => {
      const empty = document.createElement("div");
      renderCalcdownViews({ container: empty, views: [], values: {} });
      assert.equal(empty.children.length, 0);

      const inlineEmpty = document.createElement("div");
      renderCalcdownViewsInline({ container: inlineEmpty, views: [], render: [], values: {} });
      assert.equal(inlineEmpty.children.length, 0);

      const values = {
        metric: 1,
        cmpText: "x",
        notArray: 1,
        sparkConst: [
          { y: 1 },
          { y: 1 },
        ],
        t0: [
          { id: 1, v: 0, p: 1.25, note: "x" },
          { id: 2, v: 0, p: 2.5, note: null },
        ],
        tbar: [
          { id: "a", v: "x" },
          { id: "b", v: 2 },
        ],
        external: [{ id: "a", v: 1 }],
        series: [
          { x: 1, y: 1 },
          { x: 2, y: 2 },
        ],
        chartMissing: null,
      };

      const tableSchemas = {
        t0: {
          name: "t0",
          primaryKey: "id",
          columns: {
            id: type("integer"),
            v: type("number"),
            p: type("percent"),
            note: type("string"),
            curBlank: type("currency", [" "]),
          },
          rows: [],
          line: 1,
        },
        external: {
          name: "external",
          primaryKey: "id",
          columns: { id: type("string"), v: type("number") },
          source: { uri: "x.csv", format: "csv", hash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
          rows: [],
          line: 1,
        },
        tbar: {
          name: "tbar",
          primaryKey: "id",
          columns: { id: type("string"), v: type("number") },
          rows: [],
          line: 1,
        },
      };

      const views = [
        // Invisible layout ensures we take the non-layout root path.
        {
          id: "layout",
          library: "calcdown",
          type: "layout",
          visible: false,
          line: 1,
          spec: { title: "Hidden layout", direction: "row", items: [] },
        },
        {
          id: "cardsNoTitle",
          library: "calcdown",
          type: "cards",
          line: 1,
          spec: {
            items: [
              { key: "metric" },
              { key: "metric", compare: { key: "cmpText", label: "vs" } },
              { type: "sparkline", source: "notArray", key: "y", label: "NoArray", kind: "line" },
              { type: "sparkline", source: "sparkConst", key: "y", label: "Constant", kind: "line" },
            ],
          },
        },
        {
          id: "tableLimit",
          library: "calcdown",
          type: "table",
          source: "t0",
          line: 1,
          spec: {
            title: "Table",
            limit: 1,
            editable: true,
            columns: [
              { key: "v", label: "V", dataBar: { max: "auto" } },
              { key: "p", label: "P" },
              { key: "note", label: "Note" },
              { key: "curBlank", label: "BlankCur" },
            ],
          },
        },
        {
          id: "tableExternalEditableFalse",
          library: "calcdown",
          type: "table",
          source: "external",
          line: 1,
          spec: { title: "External", editable: true },
        },
        {
          id: "tableReadonlyBars",
          library: "calcdown",
          type: "table",
          source: "tbar",
          line: 1,
          spec: {
            title: "Bars",
            columns: [
              {
                key: "v",
                label: "V",
                dataBar: { max: "auto" },
                conditionalFormat: [{ when: "value == 2", style: { backgroundColor: "#fff" } }],
              },
            ],
          },
        },
        {
          id: "chartNoXFormatNoTitle",
          library: "calcdown",
          type: "chart",
          source: "series",
          line: 1,
          spec: { kind: "line", x: { key: "x" }, y: { key: "y", area: true } },
        },
        {
          id: "chartMissingSource",
          library: "calcdown",
          type: "chart",
          source: "chartMissing",
          line: 1,
          spec: { kind: "line", x: { key: "x" }, y: { key: "y" } },
        },
      ];

      const container = document.createElement("div");
      const edits = [];
      renderCalcdownViews({
        container,
        views,
        values,
        tableSchemas,
        onEditTableCell: (ev) => edits.push(ev),
      });

      assert.ok(container.textContent.includes("Table"));
      assert.ok(!container.textContent.includes("Hidden layout"));
      assert.ok(container.textContent.includes("External"));

      const inputs = nodesByTag(container, "input");
      const vInput = inputs.find((el) => el.type === "number" && el.step === "0.01" && el.value === "0");
      assert.ok(vInput);

      // Empty numeric input emits undefined.
      vInput.value = "";
      vInput.dispatchFakeEvent("input");

      // Non-finite numeric input is ignored.
      vInput.value = "x";
      vInput.dispatchFakeEvent("input");

      const pInput = inputs.find((el) => el.type === "number" && el.step === "0.01" && el.value === "1.25");
      assert.ok(pInput);
      pInput.value = "2.5";
      pInput.dispatchFakeEvent("input");

      const noteInput = inputs.find((el) => el.type === "text");
      assert.ok(noteInput);
      noteInput.value = "hi";
      noteInput.dispatchFakeEvent("input");

      assert.deepEqual(edits, [
        { tableName: "t0", primaryKey: "1", column: "v", value: undefined },
        { tableName: "t0", primaryKey: "1", column: "p", value: 2.5 },
        { tableName: "t0", primaryKey: "1", column: "note", value: "hi" },
      ]);
    },
    { document: new FakeDocument() }
  ));
