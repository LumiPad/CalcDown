import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assertBoolean,
  assertFiniteNumber,
  assertFiniteResult,
  assertValidDate,
  compareScalars,
  evalConcat,
  evalNumericBinary,
  evalUnaryMinus,
  strictEquals,
} from "../dist/calcscript/eval_ops.js";

test("eval_ops: primitive assertion helpers", () => {
  assert.equal(assertFiniteNumber(1.5, "x"), 1.5);
  assert.throws(() => assertFiniteNumber(Number.NaN, "x"), /expects finite number/);

  assert.equal(assertFiniteResult(10), 10);
  assert.throws(() => assertFiniteResult(Number.POSITIVE_INFINITY), /Non-finite numeric result/);

  assert.equal(assertBoolean(true, "x"), true);
  assert.throws(() => assertBoolean("true", "x"), /expects boolean/);

  const d = new Date("2025-01-01T00:00:00Z");
  assert.equal(assertValidDate(d, "x"), d);
  assert.throws(() => assertValidDate(new Date("nope"), "x"), /expects valid Date/);
});

test("eval_ops: scalar comparisons and strict equality semantics", () => {
  assert.equal(compareScalars("<", 1, 2), true);
  assert.equal(compareScalars("<=", 2, 2), true);
  assert.equal(compareScalars(">", 3, 2), true);
  assert.equal(compareScalars(">=", 2, 2), true);

  const a = new Date("2025-01-01T00:00:00Z");
  const b = new Date("2025-02-01T00:00:00Z");
  assert.equal(compareScalars("<", a, b), true);
  assert.throws(() => compareScalars("<", "a", "b"), /expects numbers or dates/);

  assert.equal(strictEquals(1, 1), true);
  assert.equal(strictEquals("a", "a"), true);
  assert.equal(strictEquals(true, true), true);
  assert.equal(strictEquals(new Date("2025-01-01Z"), new Date("2025-01-01Z")), true);
  assert.equal(strictEquals(null, null), true);
  assert.equal(strictEquals(undefined, undefined), true);
  assert.equal(strictEquals(null, undefined), false);
  assert.equal(strictEquals(1, "1"), false);
  assert.equal(strictEquals(new Date("2025-01-01Z"), "2025-01-01"), false);
  assert.throws(() => strictEquals({ a: 1 }, { a: 1 }), /expects comparable scalars/);
});

test("eval_ops: unary minus supports scalar and vector paths", () => {
  assert.equal(evalUnaryMinus(3, "u"), -3);
  assert.deepEqual(evalUnaryMinus([1, -2, 3], "u"), [-1, 2, -3]);
  assert.throws(() => evalUnaryMinus(["x"], "u"), /expects finite number/);
});

test("eval_ops: concat supports scalar/vector forms and validates types", () => {
  assert.equal(evalConcat("A", 2, "&"), "A2");
  assert.deepEqual(evalConcat(["A", "B"], [1, 2], "&"), ["A1", "B2"]);
  assert.deepEqual(evalConcat(["A", "B"], 3, "&"), ["A3", "B3"]);
  assert.deepEqual(evalConcat("X", [1, 2], "&"), ["X1", "X2"]);

  assert.throws(() => evalConcat(["A"], [1, 2], "&"), /vector length mismatch/);
  assert.throws(() => evalConcat({}, 1, "&"), /expects string or finite number/);
  assert.throws(() => evalConcat("x", [{}], "&"), /expects string or finite number/);
});

test("eval_ops: numeric binary supports scalar/vector forms with strict checks", () => {
  const add = (x, y) => x + y;
  const div = (x, y) => x / y;

  assert.equal(evalNumericBinary("+", 1, 2, add), 3);
  assert.deepEqual(evalNumericBinary("+", [1, 2], [3, 4], add), [4, 6]);
  assert.deepEqual(evalNumericBinary("+", [1, 2], 5, add), [6, 7]);
  assert.deepEqual(evalNumericBinary("+", 5, [1, 2], add), [6, 7]);

  assert.throws(() => evalNumericBinary("+", [1], [1, 2], add), /Vector length mismatch/);
  assert.throws(() => evalNumericBinary("+", "x", 1, add), /expects finite number/);
  assert.throws(() => evalNumericBinary("+", 1, ["x"], add), /expects finite number/);
  assert.throws(() => evalNumericBinary("/", 1, 0, div), /Non-finite numeric result/);
});
