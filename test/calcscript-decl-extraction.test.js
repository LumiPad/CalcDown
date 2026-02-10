import assert from "node:assert/strict";
import { test } from "node:test";

import { extractTopLevelConstDeclarations } from "../dist/calcscript/decl.js";

function codes(messages) {
  return messages.map((m) => m.code);
}

test("calc decl extraction: collects top-level const declarations with stable source offsets", () => {
  const source = [
    "// comment before",
    "const a = 1 + 2;",
    "const b = fn({ x: [1, 2, 3] });",
    "const c = \"semi;colon\";",
    "if (true) { const nested = 9; }",
    "const /* inline comment */ d = (x) => { return x + 1; };",
    "const e = \"escaped quote: \\\"ok\\\"\";",
    "constellation = 123;",
  ].join("\n");

  const res = extractTopLevelConstDeclarations(source, 20);
  assert.deepEqual(res.messages, []);

  assert.deepEqual(
    res.decls.map((d) => d.name),
    ["a", "b", "c", "d", "e"]
  );
  assert.equal(res.decls[0].exprText, "1 + 2");
  assert.equal(res.decls[1].exprText, "fn({ x: [1, 2, 3] })");
  assert.equal(res.decls[2].exprText, '"semi;colon"');
  assert.equal(res.decls[3].exprText, "(x) => { return x + 1; }");
  assert.equal(res.decls[0].line, 21);
  assert.ok(res.decls[0].exprStartColumn > 0);
  assert.ok(res.decls[0].exprTrimStartOffset >= 0);
});

test("calc decl extraction: reports malformed declarations and missing semicolons", () => {
  const source = [
    "const = 1;",
    "const bad 1;",
    "const ok = 2;",
    "const tail = 3",
  ].join("\n");

  const res = extractTopLevelConstDeclarations(source, 1);
  assert.deepEqual(
    res.decls.map((d) => d.name),
    ["ok"]
  );

  const found = new Set(codes(res.messages));
  assert.ok(found.has("CD_CALC_DECL_EXPECT_IDENTIFIER"));
  assert.ok(found.has("CD_CALC_DECL_EXPECT_EQUALS"));
  assert.ok(found.has("CD_CALC_DECL_MISSING_SEMICOLON"));
});

test("calc decl extraction: ignores const inside strings and comments while scanning semicolons", () => {
  const source = [
    "const a = \"/* not comment */\";",
    "const b = 'const in string ; still string';",
    "/* const hidden = 1; */",
    "// const hidden2 = 2;",
    "const c = (x) => {",
    "  const local = x + 1;",
    "  return local;",
    "};",
  ].join("\n");

  const res = extractTopLevelConstDeclarations(source, 10);
  assert.deepEqual(res.messages, []);
  assert.deepEqual(
    res.decls.map((d) => d.name),
    ["a", "b", "c"]
  );
  assert.match(res.decls[2].exprTextRaw, /const local = x \+ 1;/);
});

test("calc decl extraction: handles comments between tokens and inside expressions", () => {
  const source = [
    "const // after-const",
    "  a /* after-name */ = 1 + // in-expr",
    "  2 /* block */;",
  ].join("\n");

  const res = extractTopLevelConstDeclarations(source, 1);
  assert.deepEqual(res.messages, []);
  assert.deepEqual(
    res.decls.map((d) => d.name),
    ["a"]
  );
  assert.match(res.decls[0].exprTextRaw, /1 \+ \/\//);
  assert.match(res.decls[0].exprTextRaw, /2 \/\* block \*\//);
});
