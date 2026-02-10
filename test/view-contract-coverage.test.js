import assert from "node:assert/strict";
import { test } from "node:test";

import {
  asString,
  bannedKeys,
  defaultLabelForKey,
  err,
  isPlainObject,
  normalizeParsedView,
  sanitizeId,
  warn,
} from "../dist/view_contract_common.js";
import { validateFormat } from "../dist/view_contract_format.js";
import { validateViewsFromBlocks } from "../dist/view_contract_validate.js";
import { validateCalcdownParsedView } from "../dist/view_contract_validate_view.js";

function codes(messages) {
  return messages.map((m) => m.code);
}

test("view_contract_common utilities behave deterministically", () => {
  const messages = [];
  err(messages, 10, "E_A", "broken");
  warn(messages, 11, "W_A", "heads up", { nodeName: "n1" });

  assert.equal(messages[0].severity, "error");
  assert.equal(messages[1].severity, "warning");
  assert.equal(messages[1].nodeName, "n1");

  assert.equal(isPlainObject({ a: 1 }), true);
  assert.equal(isPlainObject(null), false);
  assert.equal(isPlainObject([]), false);

  assert.equal(asString("ok"), "ok");
  assert.equal(asString("   "), null);
  assert.equal(asString(1), null);

  assert.equal(sanitizeId("  card_1 "), "card_1");
  assert.equal(defaultLabelForKey("risk_level"), "Risk Level");
  assert.equal(defaultLabelForKey("api_url"), "API URL");
  assert.equal(defaultLabelForKey("unchanged"), "unchanged");

  assert.ok(bannedKeys.has("__proto__"));

  const normalized = normalizeParsedView({ line: 1, raw: {} });
  assert.equal(normalized.library, "calcdown");
});

test("view_contract_format validates strings and object formats", () => {
  const messages = [];

  assert.equal(validateFormat(undefined, 1, messages), null);
  assert.equal(validateFormat("integer", 1, messages), "integer");
  assert.equal(validateFormat("percent01", 1, messages), "percent01");
  assert.equal(validateFormat("invalid", 1, messages), null);
  assert.equal(validateFormat(123, 1, messages), null);

  const fmt = validateFormat({ kind: "percent", digits: 999, scale: 100 }, 4, messages);
  assert.ok(fmt && typeof fmt === "object");
  assert.equal(fmt.kind, "percent");
  assert.equal(fmt.digits, 12);
  assert.equal(fmt.scale, 100);

  const badScaleKind = validateFormat({ kind: "number", scale: 10 }, 6, messages);
  assert.equal(badScaleKind, null);

  const badScaleValue = validateFormat({ kind: "percent", scale: 0 }, 7, messages);
  assert.equal(badScaleValue, null);

  const found = new Set(codes(messages));
  assert.ok(found.has("CD_VIEW_FORMAT_SCALE_UNSUPPORTED"));
  assert.ok(found.has("CD_VIEW_FORMAT_SCALE_INVALID"));
});

test("validateCalcdownParsedView handles cards/table/chart/layout success and failures", () => {
  const unknownMessages = [];
  assert.equal(validateCalcdownParsedView({ line: 1, type: "heatmap" }, unknownMessages), null);
  assert.ok(codes(unknownMessages).includes("CD_VIEW_UNKNOWN_TYPE"));

  const cardsMissingIdMessages = [];
  assert.equal(
    validateCalcdownParsedView({ line: 2, type: "cards", spec: { items: [{ key: "a" }] } }, cardsMissingIdMessages),
    null
  );
  assert.ok(codes(cardsMissingIdMessages).includes("CD_VIEW_SCHEMA_MISSING_ID"));

  const cardsMissingSpecMessages = [];
  assert.equal(
    validateCalcdownParsedView({ line: 3, id: "c1", type: "cards", spec: "bad" }, cardsMissingSpecMessages),
    null
  );
  assert.ok(codes(cardsMissingSpecMessages).includes("CD_VIEW_SCHEMA_MISSING_SPEC"));

  const cardsMissingItemsMessages = [];
  assert.equal(
    validateCalcdownParsedView({ line: 4, id: "c1", type: "cards", spec: { items: "x" } }, cardsMissingItemsMessages),
    null
  );
  assert.ok(codes(cardsMissingItemsMessages).includes("CD_VIEW_CARDS_ITEMS_ARRAY"));

  const cardsEmptyItemsMessages = [];
  assert.equal(
    validateCalcdownParsedView({ line: 4, id: "c2", type: "cards", spec: { items: [{ nope: true }, { key: "" }] } }, cardsEmptyItemsMessages),
    null
  );
  assert.ok(codes(cardsEmptyItemsMessages).includes("CD_VIEW_CARDS_ITEMS_EMPTY"));

  const tableMissingIdMessages = [];
  assert.equal(
    validateCalcdownParsedView({ line: 5, type: "table", source: "rows", spec: {} }, tableMissingIdMessages),
    null
  );
  assert.ok(codes(tableMissingIdMessages).includes("CD_VIEW_SCHEMA_MISSING_ID"));

  const cardsValidMessages = [];
  const cards = validateCalcdownParsedView(
    {
      line: 5,
      id: " cards_1 ",
      type: "cards",
      spec: {
        title: "Summary",
        items: [{ key: "risk_level" }, { key: "ok", label: "OK", format: { kind: "percent", scale: 100 } }],
      },
    },
    cardsValidMessages
  );
  assert.ok(cards);
  assert.equal(cards.id, "cards_1");
  assert.equal(cards.spec.items[0].label, "Risk Level");
  assert.equal(cards.spec.items[1].format.kind, "percent");
  assert.deepEqual(cardsValidMessages, []);

  const tableMissingSourceMessages = [];
  assert.equal(
    validateCalcdownParsedView({ line: 6, id: "t1", type: "table", spec: {} }, tableMissingSourceMessages),
    null
  );
  assert.ok(codes(tableMissingSourceMessages).includes("CD_VIEW_SCHEMA_MISSING_SOURCE"));

  const tableInvalidSpecMessages = [];
  assert.equal(
    validateCalcdownParsedView({ line: 7, id: "t1", type: "table", source: "rows", spec: "bad" }, tableInvalidSpecMessages),
    null
  );
  assert.ok(codes(tableInvalidSpecMessages).includes("CD_VIEW_SCHEMA_MISSING_SPEC"));

  const tableMessages = [];
  const table = validateCalcdownParsedView(
    {
      line: 8,
      id: "table_1",
      type: "table",
      source: "rows",
      spec: {
        title: "Rows",
        editable: true,
        limit: 10,
        columns: [
          { key: "__proto__" },
          {
            key: "gross_margin",
            format: "percent01",
            conditionalFormat: [
              { when: "value < 0", style: "negative" },
              { when: "value > 0.5", style: { fontWeight: "bold" } },
            ],
          },
        ],
      },
    },
    tableMessages
  );
  assert.ok(table);
  assert.equal(table.spec.editable, true);
  assert.equal(table.spec.limit, 10);
  assert.equal(table.spec.columns.length, 1);
  assert.equal(table.spec.columns[0].label, "Gross Margin");
  assert.equal(table.spec.columns[0].conditionalFormat.length, 2);
  assert.equal(table.spec.columns[0].conditionalFormat[0].style, "negative");
  assert.equal(table.spec.columns[0].conditionalFormat[1].style.fontWeight, "bold");
  assert.ok(codes(tableMessages).includes("CD_VIEW_SCHEMA_DISALLOWED_KEY"));

  const chartKindMessages = [];
  assert.equal(
    validateCalcdownParsedView(
      {
        line: 9,
        id: "ch1",
        type: "chart",
        source: "rows",
        spec: { kind: "pie", x: { key: "year" }, y: { key: "value" } },
      },
      chartKindMessages
    ),
    null
  );
  assert.ok(codes(chartKindMessages).includes("CD_VIEW_CHART_KIND"));

  const chartMissingIdMessages = [];
  assert.equal(
    validateCalcdownParsedView(
      {
        line: 9,
        type: "chart",
        source: "rows",
        spec: { kind: "line", x: { key: "year" }, y: { key: "value" } },
      },
      chartMissingIdMessages
    ),
    null
  );
  assert.ok(codes(chartMissingIdMessages).includes("CD_VIEW_SCHEMA_MISSING_ID"));

  const chartMissingSourceMessages = [];
  assert.equal(
    validateCalcdownParsedView(
      {
        line: 9,
        id: "ch_missing_source",
        type: "chart",
        spec: { kind: "line", x: { key: "year" }, y: { key: "value" } },
      },
      chartMissingSourceMessages
    ),
    null
  );
  assert.ok(codes(chartMissingSourceMessages).includes("CD_VIEW_SCHEMA_MISSING_SOURCE"));

  const chartMissingSpecMessages = [];
  assert.equal(
    validateCalcdownParsedView({ line: 9, id: "ch_missing_spec", type: "chart", source: "rows", spec: null }, chartMissingSpecMessages),
    null
  );
  assert.ok(codes(chartMissingSpecMessages).includes("CD_VIEW_SCHEMA_MISSING_SPEC"));

  const chartAxesMessages = [];
  assert.equal(
    validateCalcdownParsedView(
      {
        line: 10,
        id: "ch1",
        type: "chart",
        source: "rows",
        spec: { kind: "line", x: { key: "__proto__" }, y: [{ bad: true }] },
      },
      chartAxesMessages
    ),
    null
  );
  const chartAxesCodes = new Set(codes(chartAxesMessages));
  assert.ok(chartAxesCodes.has("CD_VIEW_SCHEMA_DISALLOWED_KEY"));
  assert.ok(chartAxesCodes.has("CD_VIEW_CHART_AXES"));

  const chartMessages = [];
  const chart = validateCalcdownParsedView(
    {
      line: 11,
      id: "ch_ok",
      type: "chart",
      source: "rows",
      spec: {
        kind: "column",
        title: "Series",
        x: { key: "year" },
        y: [{ key: "value_a" }, { key: "value_b", format: { kind: "percent", scale: 100 } }],
      },
    },
    chartMessages
  );
  assert.ok(chart);
  assert.equal(chart.spec.kind, "bar");
  assert.equal(Array.isArray(chart.spec.y), true);
  assert.deepEqual(chartMessages, []);

  const layoutMissingIdMessages = [];
  assert.equal(
    validateCalcdownParsedView({ line: 12, type: "layout", spec: { items: [{ ref: "a" }] } }, layoutMissingIdMessages),
    null
  );
  assert.ok(codes(layoutMissingIdMessages).includes("CD_VIEW_SCHEMA_MISSING_ID"));

  const layoutInvalidSpecMessages = [];
  assert.equal(
    validateCalcdownParsedView({ line: 13, id: "l1", type: "layout", spec: { title: "x" } }, layoutInvalidSpecMessages),
    null
  );
  assert.ok(codes(layoutInvalidSpecMessages).includes("CD_VIEW_SCHEMA_MISSING_SPEC"));

  const layoutEmptyItemsMessages = [];
  assert.equal(
    validateCalcdownParsedView(
      {
        line: 13,
        id: "l_items",
        type: "layout",
        spec: { items: [{ nope: true }, { title: "nested-but-empty", items: [] }] },
      },
      layoutEmptyItemsMessages
    ),
    null
  );
  assert.ok(codes(layoutEmptyItemsMessages).includes("CD_VIEW_LAYOUT_ITEMS"));

  const layoutMessages = [];
  const layout = validateCalcdownParsedView(
    {
      line: 14,
      id: "layout_ok",
      type: "layout",
      spec: {
        title: "Dashboard",
        direction: "row",
        items: [{ ref: "cards_1" }, { items: [{ ref: "table_1" }] }],
      },
    },
    layoutMessages
  );
  assert.ok(layout);
  assert.equal(layout.spec.direction, "row");
  assert.equal(layout.spec.items.length, 2);
  assert.equal(layout.spec.items[1].kind, "layout");
  assert.deepEqual(layoutMessages, []);
});

test("validateCalcdownParsedView validates table conditionalFormat rules and errors", () => {
  const messages = [];
  const table = validateCalcdownParsedView(
    {
      line: 1,
      id: "t_cf",
      type: "table",
      source: "rows",
      spec: {
        columns: [
          {
            key: "a",
            conditionalFormat: [
              { when: "value > 0", style: "highlight" },
              "nope",
              { style: "positive" },
              { when: "value <", style: "positive" },
              { when: "value > 0", style: "nope" },
              { when: "value > 0", style: 123 },
              { when: "value > 0", style: { nope: "#fff" } },
              { when: "value > 0", style: { color: "" } },
              { when: "value > 0", style: {} },
            ],
          },
          { key: "b", conditionalFormat: { when: "value > 0", style: "positive" } },
        ],
      },
    },
    messages
  );
  assert.ok(table);
  assert.equal(table.spec.columns[0].conditionalFormat[0].style, "highlight");

  const found = new Set(codes(messages));
  assert.ok(found.has("CD_VIEW_TABLE_CONDFORM_ARRAY"));
  assert.ok(found.has("CD_VIEW_TABLE_CONDFORM_RULE"));
  assert.ok(found.has("CD_VIEW_TABLE_CONDFORM_WHEN"));
  assert.ok(found.has("CD_VIEW_TABLE_CONDFORM_STYLE"));
});

test("validateViewsFromBlocks deduplicates IDs, warns on non-calcdown libs, and keeps valid views", () => {
  const blocks = [
    { kind: "code", lang: "calc", fenceLine: 1, content: "const x = 1;" },
    {
      kind: "code",
      lang: "view",
      fenceLine: 10,
      content: '{"id":"dup","type":"cards","library":"calcdown","spec":{"items":[{"key":"a"}]}}',
    },
    {
      kind: "code",
      lang: "view",
      fenceLine: 20,
      content: '{"id":"dup","type":"cards","library":"calcdown","spec":{"items":[{"key":"b"}]}}',
    },
    {
      kind: "code",
      lang: "view",
      fenceLine: 30,
      content: '{"id":"ext","type":"cards","library":"vega-lite","spec":{"items":[{"key":"a"}]}}',
    },
    {
      kind: "code",
      lang: "view",
      fenceLine: 40,
      content: '{"type":"cards","library":"vega-lite","spec":{"items":[{"key":"a"}]}}',
    },
    {
      kind: "code",
      lang: "view",
      fenceLine: 50,
      content: "{ this is not: yaml: [",
    },
  ];

  const res = validateViewsFromBlocks(blocks);
  assert.equal(res.views.length, 1);
  assert.equal(res.views[0].id, "dup");

  const found = new Set(codes(res.messages));
  assert.ok(found.has("CD_VIEW_DUPLICATE_ID"));
  assert.ok(found.has("CD_VIEW_UNSUPPORTED_LIBRARY"));
  assert.ok(found.has("CD_VIEW_PARSE"));
});

test("validateCalcdownParsedView supports visible, cards sparkline/compare, and table dataBar", () => {
  const cardsMessages = [];
  const cards = validateCalcdownParsedView(
    {
      line: 1,
      id: "c_visible",
      type: "cards",
      visible: "x > 0",
      spec: {
        items: [
          { type: "sparkline", source: "t", key: "revenue", label: "Revenue", kind: "line" },
          { key: "mrr", compare: { key: "mrr_delta", label: "vs last month", format: "percent" } },
        ],
      },
    },
    cardsMessages
  );
  assert.ok(cards);
  assert.equal(cards.visible, "x > 0");
  assert.equal(cards.spec.items[0].type, "sparkline");
  assert.equal(cards.spec.items[1].compare.key, "mrr_delta");
  assert.deepEqual(cardsMessages, []);

  const badVisibleMessages = [];
  const badVisible = validateCalcdownParsedView(
    { line: 1, id: "c_bad_visible", type: "cards", visible: "x >", spec: { items: [{ key: "a" }] } },
    badVisibleMessages
  );
  assert.ok(badVisible);
  assert.ok(codes(badVisibleMessages).includes("CD_VIEW_VISIBLE"));

  const badCardsMessages = [];
  assert.equal(
    validateCalcdownParsedView(
      {
        line: 1,
        id: "c_bad_item",
        type: "cards",
        spec: {
          items: [
            { type: "nope" },
            { type: "sparkline", source: "", key: "x" },
            { type: "sparkline", source: "t", key: "x", kind: "bar" },
          ],
        },
      },
      badCardsMessages
    ),
    null
  );
  const badCodes = new Set(codes(badCardsMessages));
  assert.ok(badCodes.has("CD_VIEW_CARDS_ITEM_TYPE"));
  assert.ok(badCodes.has("CD_VIEW_CARDS_SPARKLINE_SOURCE"));
  assert.ok(badCodes.has("CD_VIEW_CARDS_SPARKLINE_KIND"));
  assert.ok(badCodes.has("CD_VIEW_CARDS_ITEMS_EMPTY"));

  const badCompareMessages = [];
  const badCompare = validateCalcdownParsedView(
    { line: 1, id: "c_bad_compare", type: "cards", spec: { items: [{ key: "a", compare: { key: "__proto__" } }] } },
    badCompareMessages
  );
  assert.ok(badCompare);
  assert.ok(codes(badCompareMessages).includes("CD_VIEW_SCHEMA_DISALLOWED_KEY"));

  const tableMessages = [];
  const table = validateCalcdownParsedView(
    {
      line: 1,
      id: "t_bar",
      type: "table",
      source: "rows",
      visible: false,
      spec: {
        columns: [
          { key: "revenue", dataBar: { color: "#3b82f6", max: "auto" } },
          { key: "bad", dataBar: true },
          { key: "bad2", dataBar: { max: 0 } },
          { key: "bad3", dataBar: { max: "nope" } },
        ],
      },
    },
    tableMessages
  );
  assert.ok(table);
  assert.equal(table.visible, false);
  assert.equal(table.spec.columns[0].dataBar.max, "auto");

  const tableCodes = new Set(codes(tableMessages));
  assert.ok(tableCodes.has("CD_VIEW_TABLE_DATABAR"));
});
