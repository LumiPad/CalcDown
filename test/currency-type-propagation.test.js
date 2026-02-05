import assert from "node:assert/strict";
import { test } from "node:test";

import { parseProgram } from "../dist/index.js";
import { inferCalcdownTypes } from "../dist/infer_types.js";

test("currency types propagate through numeric ops and std aggregations", () => {
  const markdown = [
    "---",
    "calcdown: 0.9",
    "---",
    "",
    "``` data",
    "name: items",
    "primaryKey: id",
    "columns:",
    "  id: string",
    "  qty: integer",
    "  unit_price: Currency[USD]",
    "---",
    "{\"id\":\"i1\",\"qty\":2,\"unit_price\":18.5}",
    "{\"id\":\"i2\",\"qty\":1,\"unit_price\":2.25}",
    "```",
    "",
    "``` calc",
    "const lines = std.table.map(items, (row) => ({",
    "  id: row.id,",
    "  line_total: row.qty * row.unit_price,",
    "}));",
    "",
    "const subtotal = std.math.sum(lines.line_total);",
    "const tax = subtotal * 0.1;",
    "const total = subtotal + tax;",
    "```",
    "",
  ].join("\n");

  const parsed = parseProgram(markdown);
  assert.equal(parsed.messages.filter((m) => m.severity === "error").length, 0);

  const inferred = inferCalcdownTypes(parsed.program);

  assert.equal(inferred.valueTypes.subtotal?.name, "currency");
  assert.deepEqual(inferred.valueTypes.subtotal?.args, ["USD"]);
  assert.equal(inferred.valueTypes.tax?.name, "currency");
  assert.deepEqual(inferred.valueTypes.tax?.args, ["USD"]);
  assert.equal(inferred.valueTypes.total?.name, "currency");
  assert.deepEqual(inferred.valueTypes.total?.args, ["USD"]);

  const linesSchema = inferred.computedTables.lines;
  assert.ok(linesSchema);
  assert.equal(linesSchema.columns.line_total?.name, "currency");
  assert.deepEqual(linesSchema.columns.line_total?.args, ["USD"]);
  assert.ok(linesSchema.source);
});
