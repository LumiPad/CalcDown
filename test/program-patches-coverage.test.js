import assert from "node:assert/strict";
import { test } from "node:test";

import { parseExpression } from "../dist/calcscript/parser.js";
import { applyTablePatches, collectTablePatches, parseTablePatchesFromCalcBlock } from "../dist/program_patches.js";
import { std } from "../dist/stdlib/std.js";

function codes(messages) {
  return messages.map((m) => m.code);
}

function type(name, args = []) {
  return { name, args, raw: args.length ? `${name}(${args.join(",")})` : name };
}

test("program_patches: parser accepts index/primaryKey selectors and reports selector/expr errors", () => {
  const parsed = parseTablePatchesFromCalcBlock({
    kind: "code",
    lang: "calc",
    fenceLine: 10,
    content: [
      "",
      "// comment",
      "t[0].x = 1;",
      "t[\"ok\"].x = 1 + ;",
      "t['pk'].x = 2;",
      "t[1].x = 3;",
      "not a patch",
    ].join("\n"),
  });

  assert.equal(parsed.patches.length, 2);
  assert.equal(parsed.patches[0].selector.kind, "primaryKey");
  assert.equal(parsed.patches[1].selector.kind, "index");

  const found = new Set(codes(parsed.messages));
  assert.ok(found.has("CD_CALC_PATCH_INVALID_SELECTOR"));
  assert.ok(found.has("CD_CALC_PATCH_PARSE_EXPR"));
  assert.ok(parsed.messages.some((m) => m.column && m.column > 0));

  const collected = collectTablePatches([
    { kind: "code", lang: "view", fenceLine: 1, content: "ignored" },
    { kind: "code", lang: "calc", fenceLine: 2, content: "t[1].x = 1;" },
  ]);
  assert.equal(collected.patches.length, 1);
});

test("program_patches: applyTablePatches covers validation, eval/coercion errors, and successful updates", () => {
  const baseColumns = { id: type("string"), x: type("number"), b: type("boolean") };
  const schemas = [
    { name: "t", primaryKey: "id", columns: baseColumns, rows: [], line: 1 },
    {
      name: "ext",
      primaryKey: "id",
      columns: baseColumns,
      rows: [],
      source: { uri: "x.csv", format: "csv", hash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
      line: 1,
    },
    { name: "not_table", primaryKey: "id", columns: baseColumns, rows: [], line: 1 },
  ];

  const tables = {
    t: [{ id: "a", x: 1, b: false }, { id: "b", x: 2, b: true }, new Date("2025-01-01T00:00:00Z")],
    ext: [{ id: "a", x: 1, b: false }],
    not_table: { nope: true },
  };

  const patches = [
    { tableName: "missing", selector: { kind: "index", index1: 1 }, column: "x", expr: parseExpression("1"), line: 1 },
    { tableName: "ext", selector: { kind: "index", index1: 1 }, column: "x", expr: parseExpression("1"), line: 2 },
    { tableName: "t", selector: { kind: "index", index1: 1 }, column: "__proto__", expr: parseExpression("1"), line: 3 },
    { tableName: "t", selector: { kind: "index", index1: 1 }, column: "y", expr: parseExpression("1"), line: 4 },
    { tableName: "t", selector: { kind: "index", index1: 1 }, column: "id", expr: parseExpression("\"x\""), line: 5 },
    { tableName: "not_table", selector: { kind: "index", index1: 1 }, column: "x", expr: parseExpression("1"), line: 6 },
    { tableName: "t", selector: { kind: "index", index1: 99 }, column: "x", expr: parseExpression("1"), line: 7 },
    { tableName: "t", selector: { kind: "primaryKey", value: "missing" }, column: "x", expr: parseExpression("1"), line: 8 },
    { tableName: "t", selector: { kind: "index", index1: 3 }, column: "x", expr: parseExpression("1"), line: 9 },
    { tableName: "t", selector: { kind: "index", index1: 1 }, column: "x", expr: parseExpression("1 / 0"), line: 10 },
    { tableName: "t", selector: { kind: "index", index1: 1 }, column: "b", expr: parseExpression("2"), line: 11 },
    { tableName: "t", selector: { kind: "index", index1: 1 }, column: "x", expr: parseExpression("5"), line: 12 },
    { tableName: "t", selector: { kind: "primaryKey", value: "b" }, column: "x", expr: parseExpression("7"), line: 13 },
  ];

  const messages = applyTablePatches({
    patches,
    schemas,
    tables,
    env: {},
    std,
    tablePkByArray: new WeakMap(),
  });

  const found = new Set(codes(messages));
  assert.ok(found.has("CD_CALC_PATCH_UNKNOWN_TABLE"));
  assert.ok(found.has("CD_CALC_PATCH_EXTERNAL_TABLE"));
  assert.ok(found.has("CD_CALC_PATCH_DISALLOWED_KEY"));
  assert.ok(found.has("CD_CALC_PATCH_UNKNOWN_COLUMN"));
  assert.ok(found.has("CD_CALC_PATCH_PRIMARYKEY"));
  assert.ok(found.has("CD_CALC_PATCH_TARGET_NOT_TABLE"));
  assert.ok(found.has("CD_CALC_PATCH_ROW_NOT_FOUND"));
  assert.ok(found.has("CD_CALC_PATCH_ROW_INVALID"));
  assert.ok(found.has("CD_CALC_DIV_ZERO"));
  assert.ok(found.has("CD_CALC_PATCH_TYPE"));

  const positionalWarnings = messages.filter((m) => m.code === "CD_CALC_PATCH_POSITIONAL");
  assert.equal(positionalWarnings.length, 1);

  assert.equal(tables.t[0].x, 5);
  assert.equal(tables.t[1].x, 7);
});
