import assert from "node:assert/strict";
import { test } from "node:test";

import {
  cloneTableRows,
  coerceTableCellValue,
  normalizeOverrideValue,
  toPkString,
} from "../dist/program_values.js";

function type(name, args = []) {
  return { name, args, raw: args.length ? `${name}(${args.join(",")})` : name };
}

function inputDef(name, t, defaultValue, constraints) {
  return { name, type: t, defaultText: String(defaultValue), defaultValue, ...(constraints ? { constraints } : {}), line: 1 };
}

test("program_values: toPkString and cloneTableRows", () => {
  assert.equal(toPkString("a"), "a");
  assert.equal(toPkString(42), "42");
  assert.equal(toPkString(Number.NaN), null);
  assert.equal(toPkString(null), null);

  const rows = [{ a: 1 }, { b: 2 }];
  const cloned = cloneTableRows(rows);
  assert.ok(Array.isArray(cloned));
  assert.notEqual(cloned, rows);
  assert.notEqual(cloned[0], rows[0]);
  // Row clones intentionally use null-prototype dictionaries for pollution safety.
  assert.equal(Object.getPrototypeOf(cloned[0]), null);
  assert.equal(Object.getPrototypeOf(cloned[1]), null);
  assert.deepEqual(
    cloned.map((r) => ({ ...r })),
    rows
  );
});

test("program_values: normalizeOverrideValue covers scalar/date branches", () => {
  const d = normalizeOverrideValue(inputDef("d", type("date"), new Date("2025-01-01")), "2025-02-03");
  assert.ok(d instanceof Date);
  assert.equal(d.toISOString().slice(0, 10), "2025-02-03");

  assert.equal(normalizeOverrideValue(inputDef("i", type("integer"), 1), -1.9), -1);
  assert.equal(normalizeOverrideValue(inputDef("i", type("integer"), 1), "2.9"), 2);
  assert.throws(() => normalizeOverrideValue(inputDef("i", type("integer"), 1), {}), /expected integer/);
  assert.throws(() => normalizeOverrideValue(inputDef("i", type("integer"), 1, { min: 0 }), -1), /must be >= 0/);
  assert.equal(normalizeOverrideValue(inputDef("i", type("integer"), 1, { min: 0 }), 0), 0);

  assert.equal(normalizeOverrideValue(inputDef("n", type("number"), 1), "2.5"), 2.5);
  assert.throws(() => normalizeOverrideValue(inputDef("n", type("number"), 1), {}), /expected number/);
  assert.equal(normalizeOverrideValue(inputDef("p", type("percent"), 1), 3.5), 3.5);
  assert.equal(normalizeOverrideValue(inputDef("c", type("currency", ["USD"]), 1), "2.5"), 2.5);
  assert.equal(normalizeOverrideValue(inputDef("isk", type("currency", ["ISK"]), 1), 2.6), 3);
  assert.equal(normalizeOverrideValue(inputDef("isk", type("currency", ["ISK"]), 1), "2.4"), 2);
  assert.throws(() => normalizeOverrideValue(inputDef("p", type("percent"), 1, { max: 100 }), 101), /must be <= 100/);
  assert.equal(normalizeOverrideValue(inputDef("p", type("percent"), 1, { max: 100 }), 100), 100);

  assert.equal(normalizeOverrideValue(inputDef("b", type("boolean"), false), true), true);
  assert.equal(normalizeOverrideValue(inputDef("b", type("boolean"), false), "false"), false);
  assert.throws(() => normalizeOverrideValue(inputDef("b", type("boolean"), false), "x"), /expected boolean/);

  assert.equal(normalizeOverrideValue(inputDef("s", type("string"), "a"), 123), "123");
});

test("program_values: normalizeOverrideValue fallback-by-defaultValue and clone/toPk edge paths", () => {
  assert.equal(normalizeOverrideValue(inputDef("n2", type("custom"), 10), "2.25"), 2.25);
  assert.equal(normalizeOverrideValue(inputDef("n2", type("custom"), 10), 2.25), 2.25);
  assert.equal(normalizeOverrideValue(inputDef("b2", type("custom"), false), "true"), true);
  assert.equal(normalizeOverrideValue(inputDef("s2", type("custom"), "x"), "y"), "y");
  assert.deepEqual(normalizeOverrideValue(inputDef("o2", type("custom"), { x: 1 }), 99), { x: 1 });

  assert.throws(() => normalizeOverrideValue(inputDef("n2", type("custom"), 10), Number.NaN), /expected number/);
  assert.throws(() => normalizeOverrideValue(inputDef("n2", type("custom"), 10), {}), /expected number/);
  assert.throws(() => normalizeOverrideValue(inputDef("b2", type("custom"), false), "yes"), /expected boolean/);

  assert.equal(toPkString(""), null);
  assert.equal(toPkString(Infinity), null);
  assert.equal(toPkString({}), null);

  const d = new Date("2025-01-01T00:00:00Z");
  const cloned = cloneTableRows([d, 1, null, ["x"]]);
  assert.equal(cloned[0], d);
  assert.equal(cloned[1], 1);
  assert.equal(cloned[2], null);
  assert.deepEqual(cloned[3], ["x"]);
});

test("program_values: coerceTableCellValue covers all supported types", () => {
  assert.equal(coerceTableCellValue(type("string"), 1), "1");
  assert.equal(coerceTableCellValue(type("boolean"), "true"), true);
  assert.equal(coerceTableCellValue(type("boolean"), 0), false);
  assert.throws(() => coerceTableCellValue(type("boolean"), "x"), /Expected boolean/);

  assert.equal(coerceTableCellValue(type("integer"), "2.9"), 2);
  assert.throws(() => coerceTableCellValue(type("integer"), "x"), /Expected integer/);

  assert.equal(coerceTableCellValue(type("number"), "2.5"), 2.5);
  assert.equal(coerceTableCellValue(type("percent"), 9.1), 9.1);
  assert.equal(coerceTableCellValue(type("currency", ["USD"]), 1.25), 1.25);
  assert.equal(coerceTableCellValue(type("currency", ["ISK"]), 1.6), 2);

  const date = coerceTableCellValue(type("date"), "2025-03-04");
  assert.ok(date instanceof Date);
  assert.equal(date.toISOString().slice(0, 10), "2025-03-04");
  const date2 = new Date("2025-03-04T00:00:00Z");
  assert.equal(coerceTableCellValue(type("date"), date2), date2);
  assert.throws(() => coerceTableCellValue(type("date"), new Date("nope")), /Expected valid Date/);
  assert.throws(() => coerceTableCellValue(type("date"), 1), /Expected date/);

  const dt = coerceTableCellValue(type("datetime"), "2025-03-04T12:13:14Z");
  assert.ok(dt instanceof Date);
  const dt2 = new Date("2025-03-04T12:13:14Z");
  assert.equal(coerceTableCellValue(type("datetime"), dt2), dt2);
  assert.throws(() => coerceTableCellValue(type("datetime"), new Date("nope")), /Expected valid Date/);
  assert.throws(() => coerceTableCellValue(type("datetime"), "not-a-date"), /Invalid datetime/);
  assert.throws(() => coerceTableCellValue(type("datetime"), ""), /Expected datetime value/);

  assert.equal(coerceTableCellValue(type("custom"), 123), 123);
});
