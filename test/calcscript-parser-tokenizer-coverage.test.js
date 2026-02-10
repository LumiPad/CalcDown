import assert from "node:assert/strict";
import { test } from "node:test";

import { parseExpression, asCallExpr, asIdentifierExpr, asMemberExpr, getMemberPath, isStdMemberPath } from "../dist/calcscript/parser.js";
import { CalcScriptSyntaxError, Tokenizer } from "../dist/calcscript/tokenizer.js";

test("CalcScript tokenizer: skips whitespace and comments", () => {
  const t = new Tokenizer(" \t// line\n/* block */ 1");
  const tok = t.next();
  assert.equal(tok.type, "number");
  assert.equal(tok.value, 1);
  assert.equal(t.next().type, "eof");
});

test("CalcScript tokenizer: reports unsupported tokens and malformed literals", () => {
  assert.throws(() => parseExpression("@"), (err) => {
    assert.ok(err instanceof CalcScriptSyntaxError);
    assert.match(err.message, /Unsupported token: @/);
    return true;
  });

  assert.throws(() => parseExpression("1e309"), (err) => {
    assert.ok(err instanceof CalcScriptSyntaxError);
    assert.match(err.message, /Invalid number: 1e309/);
    return true;
  });

  assert.throws(() => parseExpression('"\\'), (err) => {
    assert.ok(err instanceof CalcScriptSyntaxError);
    assert.match(err.message, /Unterminated string escape/);
    return true;
  });

  assert.throws(() => parseExpression('"abc'), (err) => {
    assert.ok(err instanceof CalcScriptSyntaxError);
    assert.match(err.message, /Unterminated string/);
    return true;
  });
});

test("CalcScript parser: strict/loose inequality tokens normalize to '!='", () => {
  const a = parseExpression("1 != 2");
  assert.equal(a.kind, "binary");
  assert.equal(a.op, "!=");

  const b = parseExpression("1 !== 2");
  assert.equal(b.kind, "binary");
  assert.equal(b.op, "!=");
});

test("CalcScript parser: errors format token strings (unexpected token / trailing token)", () => {
  const cases = [
    { src: "1 2", includes: "Unexpected trailing token: number 2" },
    { src: "foo bar", includes: "Unexpected trailing token: identifier bar" },
    { src: "true false", includes: "Unexpected trailing token: boolean false" },
    { src: '"a" "b"', includes: 'Unexpected trailing token: string "b"' },
    { src: "(1) => 2", includes: "Unexpected trailing token: '=>'" },
    { src: '({"a": b}) => 1', includes: "Unexpected trailing token: '=>'" },
    { src: "+", includes: "Unexpected token: '+'" },
    { src: ")", includes: "Unexpected token: ')'" },
    { src: "=>", includes: "Unexpected token: '=>'" },
  ];

  for (const c of cases) {
    assert.throws(
      () => parseExpression(c.src),
      (err) => err instanceof CalcScriptSyntaxError && err.message.includes(c.includes),
      c.src
    );
  }
});

test("CalcScript parser: covers uncommon grammar branches and diagnostics", () => {
  const emptyObjParam = parseExpression("({}) => 1");
  assert.equal(emptyObjParam.kind, "arrow");
  assert.equal(emptyObjParam.params.length, 1);
  assert.equal(emptyObjParam.params[0].kind, "object");
  assert.equal(emptyObjParam.params[0].properties.length, 0);

  assert.throws(
    () => parseExpression("true ? 1 2"),
    (err) => err instanceof CalcScriptSyntaxError && /Expected ':' in conditional expression/.test(err.message)
  );
  assert.throws(
    () => parseExpression("a."),
    (err) => err instanceof CalcScriptSyntaxError && err.message.includes("Expected identifier after '.'")
  );
  assert.throws(
    () => parseExpression("f(1"),
    (err) => err instanceof CalcScriptSyntaxError && err.message.includes("Expected ')'")
  );
  assert.throws(
    () => parseExpression("a[0"),
    (err) => err instanceof CalcScriptSyntaxError && /Expected ']'/.test(err.message)
  );

  assert.throws(
    () => parseExpression("{ 1: 2 }"),
    (err) => err instanceof CalcScriptSyntaxError && /Expected object property key/.test(err.message)
  );
  assert.throws(
    () => parseExpression('{ "a" }'),
    (err) => err instanceof CalcScriptSyntaxError && /String keys require ':' value/.test(err.message)
  );
  assert.throws(
    () => parseExpression("{ a: 1 b: 2 }"),
    (err) => err instanceof CalcScriptSyntaxError && /Expected ',' or '}' in object literal/.test(err.message)
  );
});

test("CalcScript parser: exported member-path helpers", () => {
  const member = parseExpression("std.math.sum");
  assert.equal(asMemberExpr(member)?.kind, "member");
  assert.deepEqual(getMemberPath(member), ["std", "math", "sum"]);
  assert.equal(isStdMemberPath(member), true);

  const call = parseExpression("std.math.sum(1)");
  assert.equal(asCallExpr(call)?.kind, "call");
  assert.deepEqual(getMemberPath(asCallExpr(call).callee), ["std", "math", "sum"]);

  const ident = parseExpression("x");
  assert.equal(asIdentifierExpr(ident)?.kind, "identifier");

  const nonStdMember = parseExpression("(1).x");
  assert.equal(isStdMemberPath(nonStdMember), false);
  assert.deepEqual(getMemberPath(nonStdMember), null);
});
