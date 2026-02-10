import assert from "node:assert/strict";
import { test } from "node:test";

import { compileCalcScript } from "../dist/calcscript/compile.js";
import { evaluateExpression, evaluateNodes } from "../dist/calcscript/eval.js";
import { parseExpression } from "../dist/calcscript/parser.js";

test("CalcScript compile: collects dependencies (arrow params do not leak)", () => {
  const source = [
    "const y = 10;",
    "const f = (x, { a: b, c }) => x + b + c + y + std.math.sum(1);",
  ].join("\n");

  const { nodes, messages } = compileCalcScript(source, 1);
  assert.deepEqual(messages, []);
  assert.deepEqual(
    nodes.map((n) => ({ name: n.name, deps: n.dependencies })),
    [
      { name: "y", deps: [] },
      { name: "f", deps: ["y"] },
    ]
  );
});

test("CalcScript compile: validation errors surface as stable message codes", () => {
  const source = [
    "const a = 1;",
    "const a = 2;",
    "const m = foo.__proto__;",
    "const o = { __proto__: 1 };",
    "const p = (__proto__) => 1;",
    "const d = (x, x) => x;",
    "const ds = ({ __proto__ }) => 1;",
  ].join("\n");

  const { messages } = compileCalcScript(source, 1);
  const codes = new Set(messages.map((m) => m.code));
  assert.ok(codes.has("CD_CALC_DUPLICATE_NODE"));
  assert.ok(codes.has("CD_CALC_DISALLOWED_MEMBER"));
  assert.ok(codes.has("CD_CALC_DISALLOWED_OBJECT_KEY"));
  assert.ok(codes.has("CD_CALC_DISALLOWED_PARAM"));
  assert.ok(codes.has("CD_CALC_DUPLICATE_PARAM"));
});

test("CalcScript compile: multi-line parse errors report line/column", () => {
  const source = ["const bad = 1 +", ");"].join("\n");
  const { nodes, messages } = compileCalcScript(source, 1);
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].name, "bad");
  assert.equal(nodes[0].expr, undefined);

  const err = messages.find((m) => m.code === "CD_CALC_PARSE_EXPR");
  assert.ok(err);
  assert.equal(err.line, 2);
  assert.equal(err.column, 1);
});

test("CalcScript eval: covers division, unsafe calls, destructuring errors, and node cycles", () => {
  const tablePkByArray = new WeakMap();

  assert.equal(evaluateExpression(parseExpression("6 / 2"), {}, {}, tablePkByArray), 3);
  assert.equal(evaluateExpression(parseExpression("5 - 2"), {}, {}, tablePkByArray), 3);
  assert.equal(evaluateExpression(parseExpression("2 ** 3"), {}, {}, tablePkByArray), 8);
  assert.throws(
    () => evaluateExpression(parseExpression("a.foo"), { a: 1 }, {}, tablePkByArray),
    /Cannot access property foo on non-object/
  );

  assert.throws(
    () => evaluateExpression(parseExpression("foo()"), {}, {}, tablePkByArray),
    /Only std\./
  );

  const notFnEnv = { std: { math: { sum: 1 } } };
  assert.throws(
    () => evaluateExpression(parseExpression("std.math.sum(1)"), notFnEnv, {}, tablePkByArray),
    /Callee is not a function/
  );

  const fakeFn = () => 1;
  const notStdFnEnv = { std: { math: { sum: fakeFn } } };
  assert.throws(
    () => evaluateExpression(parseExpression("std.math.sum(1)"), notStdFnEnv, {}, tablePkByArray),
    /Only std library functions may be called/
  );

  const f = evaluateExpression(parseExpression("({ x }) => x"), {}, {}, tablePkByArray);
  assert.equal(typeof f, "function");
  assert.throws(() => f(123), /Object destructuring requires an object argument/);

  const cycle = evaluateNodes(
    [
      { name: "a", expr: parseExpression("b + 1"), dependencies: ["b"], line: 1 },
      { name: "b", expr: parseExpression("a + 1"), dependencies: ["a"], line: 2 },
    ],
    {},
    {},
    tablePkByArray
  );
  assert.ok(cycle.messages.some((m) => m.code === "CD_CALC_CYCLE"));

  const missing = evaluateNodes([{ name: "a", dependencies: [], line: 1 }], {}, {}, tablePkByArray);
  assert.equal(Object.keys(missing.values).length, 0);
});
