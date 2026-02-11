import assert from "node:assert/strict";
import { test } from "node:test";

import { runCalcdown } from "../dist/web/run.js";

function codes(messages) {
  return messages.map((m) => m.code);
}

test("runCalcdown: warns when percent points format is applied to ratio-like table columns", () => {
  const markdown = [
    "---",
    "calcdown: 1.2",
    "---",
    "",
    "```data",
    "name: rows",
    "primaryKey: id",
    "columns:",
    "  id: string",
    "  share: number",
    "---",
    "{\"id\":\"a\",\"share\":0.36923076923076925}",
    "{\"id\":\"b\",\"share\":0.1}",
    "```",
    "",
    "```view",
    JSON.stringify(
      {
        id: "t",
        library: "calcdown",
        type: "table",
        source: "rows",
        spec: {
          title: "Shares",
          editable: false,
          columns: [{ key: "share", label: "Share", format: "percent" }],
        },
      },
      null,
      2
    ),
    "```",
    "",
  ].join("\n");

  const res = runCalcdown(markdown);
  assert.ok(codes(res.viewMessages).includes("CD_VIEW_FORMAT_PERCENT_POINTS_LIKELY_RATIO"));
});

test("runCalcdown: does not warn when ratio columns use percent01/percent_ratio formats", () => {
  const markdown = [
    "---",
    "calcdown: 1.2",
    "---",
    "",
    "```data",
    "name: rows",
    "primaryKey: id",
    "columns:",
    "  id: string",
    "  share: number",
    "---",
    "{\"id\":\"a\",\"share\":0.36923076923076925}",
    "{\"id\":\"b\",\"share\":0.1}",
    "```",
    "",
    "```view",
    JSON.stringify(
      {
        id: "t",
        library: "calcdown",
        type: "table",
        source: "rows",
        spec: {
          title: "Shares",
          editable: false,
          columns: [{ key: "share", label: "Share", format: "percent01" }],
        },
      },
      null,
      2
    ),
    "```",
    "",
  ].join("\n");

  const res = runCalcdown(markdown);
  assert.equal(codes(res.viewMessages).includes("CD_VIEW_FORMAT_PERCENT_POINTS_LIKELY_RATIO"), false);
});

