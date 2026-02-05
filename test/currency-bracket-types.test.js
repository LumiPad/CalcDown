import assert from "node:assert/strict";
import { test } from "node:test";

import { parseProgram } from "../dist/index.js";

test("inputs: Currency[USD] parses as currency(USD)", () => {
  const markdown = [
    "---",
    "calcdown: 0.9",
    "---",
    "",
    "``` inputs",
    "amount : Currency[USD] = 123.45",
    "```",
    "",
  ].join("\n");

  const res = parseProgram(markdown);
  assert.equal(res.messages.filter((m) => m.severity === "error").length, 0);

  const def = res.program.inputs.find((i) => i.name === "amount");
  assert.ok(def);
  assert.equal(def.type.name, "currency");
  assert.deepEqual(def.type.args, ["USD"]);
});

test("data: Currency[eur] parses as currency(EUR)", () => {
  const markdown = [
    "---",
    "calcdown: 0.9",
    "---",
    "",
    "``` data",
    "name: prices",
    "primaryKey: id",
    "columns:",
    "  id: string",
    "  price: Currency[eur]",
    "---",
    "{\"id\":\"p1\",\"price\":10}",
    "```",
    "",
  ].join("\n");

  const res = parseProgram(markdown);
  assert.equal(res.messages.filter((m) => m.severity === "error").length, 0);

  const table = res.program.tables.find((t) => t.name === "prices");
  assert.ok(table);
  assert.equal(table.columns.price?.name, "currency");
  assert.deepEqual(table.columns.price?.args, ["EUR"]);
});

