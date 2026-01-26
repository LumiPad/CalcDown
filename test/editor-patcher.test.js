import assert from "node:assert/strict";
import { test } from "node:test";

import { evaluateProgram, parseProgram } from "../dist/index.js";
import { applyPatch, buildSourceMap } from "../dist/editor/patcher.js";

test("Editor patcher: input line numbers include front matter", () => {
  const src = `---\ncalcdown: 0.9\n---\n\n\`\`\`inputs\nx : integer = 10\n\`\`\`\n`;
  const parsed = parseProgram(src);
  assert.equal(parsed.program.inputs.length, 1);
  assert.equal(parsed.program.inputs[0].name, "x");
  assert.equal(parsed.program.inputs[0].line, 6);
});

test("Editor patcher: updateInput preserves inline comments", () => {
  const src = `---\ncalcdown: 0.9\n---\n\n\`\`\`inputs\nx : integer = 10   # keep me\n\`\`\`\n\n\`\`\`calc\nconst y = x + 1;\n\`\`\`\n`;
  const parsed = parseProgram(src);
  const map = buildSourceMap(parsed.program);
  const next = applyPatch(src, { kind: "updateInput", name: "x", value: 20 }, map);

  assert.ok(next.includes("x : integer = 20"), "expected updated default value");
  assert.ok(next.includes("# keep me"), "expected comment to be preserved");

  const parsed2 = parseProgram(next);
  assert.equal(parsed2.program.inputs[0].defaultValue, 20);
  const evaluated = evaluateProgram(parsed2.program, {});
  assert.equal(evaluated.values.y, 21);
});

test("Editor patcher: updateTableCell patches by primaryKey (not row index)", () => {
  const src = `---\ncalcdown: 0.9\n---\n\n\`\`\`data\nname: items\nprimaryKey: id\nsortBy: name\ncolumns:\n  id: string\n  name: string\n  qty: integer\n  unit_price: number\n---\n{\"id\":\"i1\",\"name\":\"Coffee beans\",\"qty\":2,\"unit_price\":18.5}\n{\"id\":\"i2\",\"name\":\"Milk\",\"qty\":1,\"unit_price\":2.25}\n{\"id\":\"i3\",\"name\":\"Croissant\",\"qty\":3,\"unit_price\":3.1}\n\`\`\`\n\n\`\`\`calc\nconst subtotal = std.math.sum(items.qty * items.unit_price);\n\`\`\`\n`;

  const parsed = parseProgram(src);
  const before = evaluateProgram(parsed.program, {});
  assert.equal(before.values.subtotal, 48.55);

  const map = buildSourceMap(parsed.program);
  const next = applyPatch(src, { kind: "updateTableCell", tableName: "items", primaryKey: "i3", column: "qty", value: 10 }, map);
  assert.ok(next.includes("\"id\":\"i3\"") && next.includes("\"qty\":10"), "expected i3.qty to be updated");

  const parsed2 = parseProgram(next);
  const after = evaluateProgram(parsed2.program, {});
  assert.equal(after.values.subtotal, 70.25);
});

test("Editor patcher: updateTableCell rejects external tables", () => {
  const src = `---\ncalcdown: 0.9\n---\n\n\`\`\`data\nname: items\nprimaryKey: id\ncolumns:\n  id: string\n  qty: integer\nsource: items.csv\nformat: csv\nhash: sha256:0000000000000000000000000000000000000000000000000000000000000000\n---\n\`\`\`\n`;

  const parsed = parseProgram(src);
  const map = buildSourceMap(parsed.program);
  assert.throws(
    () => applyPatch(src, { kind: "updateTableCell", tableName: "items", primaryKey: "a", column: "qty", value: 2 }, map),
    /read-only/i
  );
});
