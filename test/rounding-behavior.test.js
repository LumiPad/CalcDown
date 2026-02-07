import assert from "node:assert/strict";
import { test } from "node:test";

import { evaluateProgram, parseProgram } from "../dist/index.js";
import { applyPatch, buildSourceMap } from "../dist/editor/patcher.js";

test("CalcDown eval: std.math.round handles half-away-from-zero and +/-digits", () => {
  const src = [
    "---",
    "calcdown: 1.0",
    "---",
    "",
    "``` calc",
    "const r_pos_half = std.math.round(2.5, 0);",
    "const r_neg_half = std.math.round(-2.5, 0);",
    "const r_pos_2 = std.math.round(12.345, 2);",
    "const r_neg_2 = std.math.round(-12.345, 2);",
    "const r_pos_tens = std.math.round(149.99, -1);",
    "const r_neg_tens = std.math.round(-149.99, -1);",
    "```",
    "",
  ].join("\n");

  const parsed = parseProgram(src);
  assert.equal(parsed.messages.filter((m) => m.severity === "error").length, 0);

  const evaluated = evaluateProgram(parsed.program, {});
  assert.equal(evaluated.messages.filter((m) => m.severity === "error").length, 0);

  assert.equal(evaluated.values.r_pos_half, 3);
  assert.equal(evaluated.values.r_neg_half, -3);
  assert.equal(evaluated.values.r_pos_2, 12.35);
  assert.equal(evaluated.values.r_neg_2, -12.35);
  assert.equal(evaluated.values.r_pos_tens, 150);
  assert.equal(evaluated.values.r_neg_tens, -150);
});

test("CalcDown eval: ISK rounds to whole króna while integer keeps truncation semantics", () => {
  const src = [
    "---",
    "calcdown: 1.0",
    "---",
    "",
    "``` inputs",
    "isk_amount : currency(ISK) = 154.3",
    "usd_amount : currency(USD) = 154.3",
    "qty        : integer       = 1",
    "```",
    "",
    "``` calc",
    "const passthrough = isk_amount + usd_amount;",
    "```",
    "",
  ].join("\n");

  const parsed = parseProgram(src);
  assert.equal(parsed.messages.filter((m) => m.severity === "error").length, 0);

  const defaults = evaluateProgram(parsed.program, {});
  assert.equal(defaults.values.isk_amount, 154);
  assert.equal(defaults.values.usd_amount, 154.3);

  const withOverrides = evaluateProgram(parsed.program, {
    isk_amount: 154.7,
    usd_amount: 154.7,
    qty: -1.9,
  });

  assert.equal(withOverrides.messages.filter((m) => m.severity === "error").length, 0);
  assert.equal(withOverrides.values.isk_amount, 155);
  assert.equal(withOverrides.values.usd_amount, 154.7);
  assert.equal(withOverrides.values.qty, -1);
});

test("CalcDown parse/eval/patch: ISK table cells round and integer cells truncate", () => {
  const src = [
    "---",
    "calcdown: 1.0",
    "---",
    "",
    "``` data",
    "name: ledger",
    "primaryKey: id",
    "columns:",
    "  id: string",
    "  amount_isk: currency(ISK)",
    "  units: integer",
    "---",
    "{\"id\":\"a\",\"amount_isk\":100.6,\"units\":2}",
    "{\"id\":\"b\",\"amount_isk\":100.4,\"units\":1}",
    "```",
    "",
    "``` calc",
    "const total_amount = std.table.sum(ledger, \"amount_isk\");",
    "```",
    "",
  ].join("\n");

  const parsed = parseProgram(src);
  assert.equal(parsed.messages.filter((m) => m.severity === "error").length, 0);

  const evaluated = evaluateProgram(parsed.program, {});
  assert.equal(evaluated.messages.filter((m) => m.severity === "error").length, 0);
  assert.deepEqual(evaluated.values.ledger.map((r) => r.amount_isk), [101, 100]);
  assert.equal(evaluated.values.total_amount, 201);

  const map1 = buildSourceMap(parsed.program);
  const afterIskPatch = applyPatch(src, {
    kind: "updateTableCell",
    tableName: "ledger",
    primaryKey: "a",
    column: "amount_isk",
    value: 10.6,
  }, map1);
  assert.match(afterIskPatch, /"amount_isk":11/);

  const parsed2 = parseProgram(afterIskPatch);
  const map2 = buildSourceMap(parsed2.program);
  const afterIntegerPatch = applyPatch(afterIskPatch, {
    kind: "updateTableCell",
    tableName: "ledger",
    primaryKey: "a",
    column: "units",
    value: -1.9,
  }, map2);
  assert.match(afterIntegerPatch, /"units":-1/);
});

