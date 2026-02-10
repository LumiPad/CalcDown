import assert from "node:assert/strict";
import { test } from "node:test";

import { createStd, std } from "../dist/stdlib/std.js";
import { deepFreeze } from "../dist/stdlib/std_shared.js";

function iso(date) {
  assert.ok(date instanceof Date);
  return date.toISOString().slice(0, 10);
}

function approxEqual(actual, expected, tol = 1e-9) {
  assert.ok(Number.isFinite(actual), `Expected finite actual, got ${actual}`);
  assert.ok(Number.isFinite(expected), `Expected finite expected, got ${expected}`);
  assert.ok(Math.abs(actual - expected) <= tol, `Expected ${actual} ≈ ${expected} (tol=${tol})`);
}

test("std.math.sum", () => {
  assert.equal(std.math.sum([1, 2, 3]), 6);
  assert.equal(std.math.sum([]), 0);
  assert.throws(() => std.math.sum("nope"), /sum: expected array/);
  assert.throws(() => std.math.sum([1, "2"]), /sum: expected finite number array/);
  assert.throws(() => std.math.sum([1, Number.POSITIVE_INFINITY]), /sum: expected finite number array/);
});

test("std.math.mean / minOf / maxOf / round", () => {
  assert.equal(std.math.mean([2, 4, 6]), 4);
  assert.throws(() => std.math.mean([]), /mean: empty array/);
  assert.throws(() => std.math.mean([1, Number.POSITIVE_INFINITY]), /mean: expected finite number array/);
  assert.throws(() => std.math.mean("nope"), /mean: expected array/);
  assert.throws(() => std.math.mean([1, "2"]), /mean: expected finite number array/);

  assert.equal(std.math.minOf([2, -1, 5]), -1);
  assert.equal(std.math.maxOf([2, -1, 5]), 5);
  assert.throws(() => std.math.minOf([]), /minOf: empty array/);
  assert.throws(() => std.math.maxOf([]), /maxOf: empty array/);
  assert.throws(() => std.math.minOf("nope"), /minOf: expected array/);
  assert.throws(() => std.math.maxOf("nope"), /maxOf: expected array/);
  assert.throws(() => std.math.minOf([Number.NaN]), /minOf: expected finite number array/);
  assert.throws(() => std.math.maxOf([Number.NaN]), /maxOf: expected finite number array/);
  assert.throws(() => std.math.minOf([1, Number.POSITIVE_INFINITY]), /minOf: expected finite number array/);
  assert.throws(() => std.math.maxOf([1, Number.POSITIVE_INFINITY]), /maxOf: expected finite number array/);

  assert.equal(std.math.round(1.2345, 2), 1.23);
  assert.equal(std.math.round(1.235, 2), 1.24);
  assert.equal(std.math.round(-1.5, 0), -2); // half away from zero
  assert.equal(std.math.round(150, -2), 200);

  assert.throws(() => std.math.round(Number.NaN), /round: x must be finite/);
  assert.throws(() => std.math.round(1, 1.5), /round: digits must be integer/);
  assert.throws(() => std.math.round(1, 99), /round: digits out of range/);
  assert.throws(() => std.math.round(1, "2"), /round: digits must be integer/);
  assert.throws(() => std.math.round(1, Number.POSITIVE_INFINITY), /round: digits must be integer/);
});

test("std.math.abs / sign / sqrt / exp / ln / log10 / trig / helpers / constants", () => {
  assert.equal(std.math.abs(-2.5), 2.5);
  assert.equal(std.math.abs(0), 0);
  assert.throws(() => std.math.abs(Number.NaN), /abs: x must be finite/);

  assert.equal(std.math.sign(-10), -1);
  assert.equal(std.math.sign(0), 0);
  assert.equal(std.math.sign(10), 1);
  assert.equal(std.math.sign(-0), 0);
  assert.throws(() => std.math.sign(Number.NaN), /sign: x must be finite/);

  assert.equal(std.math.sqrt(9), 3);
  assert.throws(() => std.math.sqrt(-1), /Non-finite numeric result/);

  approxEqual(std.math.exp(0), 1);
  assert.throws(() => std.math.exp(1000), /Non-finite numeric result/);

  approxEqual(std.math.ln(Math.E), 1);
  assert.throws(() => std.math.ln(0), /Non-finite numeric result/);

  approxEqual(std.math.log10(1000), 3);
  assert.throws(() => std.math.log10(0), /Non-finite numeric result/);

  approxEqual(std.math.sin(0), 0);
  approxEqual(std.math.cos(0), 1);
  approxEqual(std.math.tan(0), 0);

  approxEqual(std.math.asin(0), 0);
  approxEqual(std.math.acos(1), 0);
  approxEqual(std.math.atan(0), 0);
  approxEqual(std.math.atan2(0, 1), 0);
  assert.throws(() => std.math.asin(2), /Non-finite numeric result/);

  approxEqual(std.math.sinh(0), 0);
  assert.throws(() => std.math.sinh(1000), /Non-finite numeric result/);
  approxEqual(std.math.cosh(0), 1);
  approxEqual(std.math.tanh(0), 0);

  assert.equal(std.math.ceil(1.2), 2);
  assert.equal(std.math.floor(1.8), 1);
  assert.equal(std.math.trunc(1.8), 1);
  assert.equal(std.math.trunc(-1.8), -1);

  assert.equal(std.math.pow(2, 3), 8);
  assert.throws(() => std.math.pow(1e308, 2), /Non-finite numeric result/);

  approxEqual(std.math.E, Math.E);
  approxEqual(std.math.PI, Math.PI);

  // Error branches
  assert.throws(() => std.math.sin(Number.NaN), /sin: x must be finite/);
  assert.throws(() => std.math.acos(2), /Non-finite numeric result/);
  assert.throws(() => std.math.atan2(0, Number.NaN), /atan2: x must be finite/);
  assert.throws(() => std.math.cosh(1000), /Non-finite numeric result/);
  assert.throws(() => std.math.ceil(Number.NaN), /ceil: x must be finite/);

  // Type-check branches (typeof !== "number")
  for (const fn of [
    "sin",
    "cos",
    "tan",
    "asin",
    "acos",
    "atan",
    "sinh",
    "cosh",
    "tanh",
    "ceil",
    "floor",
    "trunc",
  ]) {
    assert.throws(() => std.math[fn]("x"), new RegExp(`${fn}: x must be finite`));
    assert.throws(() => std.math[fn](Number.POSITIVE_INFINITY), new RegExp(`${fn}: x must be finite`));
  }
  for (const fn of ["abs", "sign", "sqrt", "exp", "ln", "log10"]) {
    assert.throws(() => std.math[fn](Number.POSITIVE_INFINITY), new RegExp(`${fn}: x must be finite`));
  }
  assert.throws(() => std.math.atan2("x", 0), /atan2: y must be finite/);
  assert.throws(() => std.math.pow("x", 2), /pow: base must be finite/);
  assert.throws(() => std.math.pow(2, "x"), /pow: exp must be finite/);
  assert.throws(() => std.math.atan2(0, Number.POSITIVE_INFINITY), /atan2: x must be finite/);
  assert.throws(() => std.math.atan2(Number.POSITIVE_INFINITY, 0), /atan2: y must be finite/);
  assert.throws(() => std.math.pow(Number.POSITIVE_INFINITY, 2), /pow: base must be finite/);
  assert.throws(() => std.math.pow(2, Number.POSITIVE_INFINITY), /pow: exp must be finite/);
});

test("std.text.concat / repeat", () => {
  assert.equal(std.text.concat("A", 1, "B"), "A1B");
  assert.deepEqual(std.text.concat("A", [1, 2, 3]), ["A1", "A2", "A3"]);
  assert.deepEqual(std.text.concat(["A", "B"], [10, 20]), ["A10", "B20"]);
  assert.deepEqual(std.text.concat(["A", "B"], ":", [10, 20]), ["A:10", "B:20"]);

  assert.throws(() => std.text.concat([1, 2], [3]), /concat: array length mismatch/);
  assert.throws(() => std.text.concat(Symbol("x")), /concat: expected string or finite number/);
  assert.throws(() => std.text.concat([Number.POSITIVE_INFINITY]), /concat \[index 0\]: expected finite numbers/);

  assert.equal(std.text.repeat("ab", 3), "ababab");
  assert.equal(std.text.repeat("x", 0), "");
  assert.deepEqual(std.text.repeat(["a", "bb"], 2), ["aa", "bbbb"]);

  assert.throws(() => std.text.repeat("x", -1), /repeat: count must be a non-negative integer/);
  assert.throws(() => std.text.repeat("x", 1.5), /repeat: count must be a non-negative integer/);
  assert.throws(() => std.text.repeat(123, 2), /repeat: expected string or string array/);
  assert.throws(() => std.text.repeat(["ok", 1], 2), /repeat: expected string array/);
});

test("std.text basic string helpers", () => {
  assert.equal(std.text.upper("aBc"), "ABC");
  assert.deepEqual(std.text.upper(["a", "Bb"]), ["A", "BB"]);
  assert.throws(() => std.text.upper(123), /upper: expected string or string array/);
  assert.throws(() => std.text.upper(["ok", 1]), /upper: expected string array/);

  assert.equal(std.text.lower("aBc"), "abc");
  assert.deepEqual(std.text.lower(["A", "Bb"]), ["a", "bb"]);
  assert.throws(() => std.text.lower(123), /lower: expected string or string array/);
  assert.throws(() => std.text.lower(["ok", 1]), /lower: expected string array/);

  assert.equal(std.text.trim("  hi \n"), "hi");
  assert.deepEqual(std.text.trim([" a ", "b  "]), ["a", "b"]);
  assert.throws(() => std.text.trim(123), /trim: expected string or string array/);
  assert.throws(() => std.text.trim(["ok", 1]), /trim: expected string array/);

  assert.equal(std.text.length("abc"), 3);
  assert.deepEqual(std.text.length(["a", "bb"]), [1, 2]);
  assert.throws(() => std.text.length(123), /length: expected string or string array/);
  assert.throws(() => std.text.length(["ok", 1]), /length: expected string array/);

  assert.equal(std.text.slice("hello", 1, 4), "ell");
  assert.equal(std.text.slice("hello", 2), "llo");
  assert.deepEqual(std.text.slice(["hello", "world"], 1, 3), ["el", "or"]);
  assert.deepEqual(std.text.slice(["abcd", "efgh"], [1, 2]), ["bcd", "gh"]);
  assert.throws(() => std.text.slice("x", 1.2), /slice: start must be integer/);
  assert.throws(() => std.text.slice("x", 1, 1.2), /slice: end must be integer/);
  assert.throws(() => std.text.slice(["ab"], [1, 2]), /slice: array length mismatch/);

  assert.deepEqual(std.text.split("a,b,c", ","), ["a", "b", "c"]);
  assert.deepEqual(std.text.split(["a|b", "c|d"], "|"), [
    ["a", "b"],
    ["c", "d"],
  ]);
  assert.throws(() => std.text.split("a,b", 1), /split: expected separator string/);
  assert.throws(() => std.text.split(["ok", 1], ","), /split: expected string or string array/);
  assert.throws(() => std.text.split(["a"], [",", "."]), /split: array length mismatch/);

  assert.equal(std.text.startsWith("hello", "he"), true);
  assert.deepEqual(std.text.startsWith(["he", "no"], "he"), [true, false]);
  assert.throws(() => std.text.startsWith(["a"], ["a", "b"]), /startsWith: array length mismatch/);
  assert.throws(() => std.text.startsWith("hello", 1), /startsWith: expected prefix string/);
  assert.throws(() => std.text.startsWith(["ok", 1], "o"), /startsWith: expected string or string array/);

  assert.equal(std.text.contains("hello", "ell"), true);
  assert.deepEqual(std.text.contains(["a", "b"], ["a", "x"]), [true, false]);
  assert.throws(() => std.text.contains("hello", 1), /contains: expected needle string/);
  assert.throws(() => std.text.contains(["a"], ["a", "b"]), /contains: array length mismatch/);
  assert.throws(() => std.text.contains(["ok", 1], "o"), /contains: expected string or string array/);

  assert.equal(std.text.padStart("42", 5, "0"), "00042");
  assert.equal(std.text.padStart("x", 3), "  x");
  assert.deepEqual(std.text.padStart(["1", "22"], 3, "0"), ["001", "022"]);
  assert.deepEqual(std.text.padStart(["1", "22"], 3), ["  1", " 22"]);
  assert.throws(() => std.text.padStart("x", -1), /padStart: targetLength must be a non-negative integer/);
  assert.throws(() => std.text.padStart("x", 1.5), /padStart: targetLength must be a non-negative integer/);
  assert.throws(() => std.text.padStart("x", 3, 1), /padStart: padString must be a string/);
  assert.throws(() => std.text.padStart(["ok", 1], 3), /padStart: expected string or string array/);

  assert.equal(std.text.format("{0} of {1}", 3, 10), "3 of 10");
  assert.deepEqual(std.text.format("X{0}", [1, 2, 3]), ["X1", "X2", "X3"]);
  assert.deepEqual(std.text.format(["A{0}", "B{0}"], ["1", "2"]), ["A1", "B2"]);
  const big = "9".repeat(400);
  assert.equal(std.text.format(`{${big}}`, 1), `{${big}}`);
  assert.throws(() => std.text.format(123, 1), /format: expected template string/);
  assert.throws(() => std.text.format("{1}", "a"), /format: missing argument \{1\}/);
  assert.throws(() => std.text.format("X{0}", [1], [2, 3]), /format: array length mismatch/);
});

test("std.data.sequence", () => {
  assert.deepEqual(std.data.sequence(0), []);
  assert.deepEqual(std.data.sequence(5), [1, 2, 3, 4, 5]);
  assert.deepEqual(std.data.sequence(3, { start: 0 }), [0, 1, 2]);
  assert.deepEqual(std.data.sequence(3, {}), [1, 2, 3]);
  assert.deepEqual(std.data.sequence(3, { start: null }), [1, 2, 3]);
  assert.deepEqual(std.data.sequence(3, { step: null }), [1, 2, 3]);
  assert.deepEqual(std.data.sequence(4, { start: 10, step: 2 }), [10, 12, 14, 16]);

  assert.throws(() => std.data.sequence(-1), /sequence: count must be a non-negative integer/);
  assert.throws(() => std.data.sequence(1.25), /sequence: count must be a non-negative integer/);
  assert.throws(() => std.data.sequence(Number.NaN), /sequence: count must be a non-negative integer/);
});

test("std.data.filter", () => {
  assert.deepEqual(std.data.filter([1, 2, 3, 4], (x) => x % 2 === 0), [2, 4]);
  assert.deepEqual(std.data.filter([], () => true), []);
  assert.throws(() => std.data.filter("nope", () => true), /filter: expected array/);
  assert.throws(() => std.data.filter([1], "nope"), /filter: expected predicate function/);
});

test("std.data.sortBy", () => {
  const rows = [
    { id: "a", n: 2 },
    { id: "b", n: 1 },
    { id: "c", n: 2 },
    { id: "d" },
    { id: "e" },
  ];
  assert.deepEqual(
    std.data.sortBy(rows, "n").map((r) => r.id),
    ["b", "a", "c", "d", "e"]
  );
  assert.deepEqual(
    std.data.sortBy(rows, "n", "desc").map((r) => r.id),
    ["a", "c", "b", "d", "e"]
  );

  const dateRows = [
    { id: "a", d: new Date(Date.UTC(2024, 0, 2)) },
    { id: "b", d: new Date(Date.UTC(2024, 0, 1)) },
  ];
  assert.deepEqual(
    std.data.sortBy(dateRows, "d").map((r) => r.id),
    ["b", "a"]
  );

  const strRows = [
    { id: "b", s: "b" },
    { id: "a", s: "a" },
  ];
  assert.deepEqual(
    std.data.sortBy(strRows, "s").map((r) => r.id),
    ["a", "b"]
  );

  const strTies = [
    { id: "a", s: "x" },
    { id: "b", s: "x" },
    { id: "c", s: "y" },
  ];
  assert.deepEqual(
    std.data.sortBy(strTies, "s").map((r) => r.id),
    ["a", "b", "c"]
  );

  assert.throws(() => std.data.sortBy("nope", "n"), /sortBy: expected rows array/);
  assert.throws(() => std.data.sortBy(rows, ""), /sortBy: expected key string/);
  assert.throws(() => std.data.sortBy(rows, "__proto__"), /sortBy: disallowed key/);
  assert.throws(() => std.data.sortBy(rows, "n", "nope"), /sortBy: direction must be 'asc' or 'desc'/);
  assert.throws(() => std.data.sortBy([1], "n"), /sortBy: expected row objects/);
  assert.throws(() => std.data.sortBy([null], "n"), /sortBy: expected row objects/);
  assert.throws(() => std.data.sortBy([{ n: Number.POSITIVE_INFINITY }], "n"), /sortBy: expected finite number keys/);
  assert.throws(() => std.data.sortBy([{ n: true }], "n"), /sortBy: unsupported key type/);
  assert.throws(() => std.data.sortBy([{ n: 1 }, { n: "x" }], "n"), /sortBy: mixed key types/);

  // All-none keys cover the none/none stable-order branch.
  const allNone = [{ id: "a" }, { id: "b" }, { id: "c" }];
  assert.deepEqual(
    std.data.sortBy(allNone, "missing").map((r) => r.id),
    ["a", "b", "c"]
  );

  // null keys also map to "none"
  const nullKeys = [
    { id: "a", n: null },
    { id: "b", n: 1 },
  ];
  assert.deepEqual(
    std.data.sortBy(nullKeys, "n").map((r) => r.id),
    ["b", "a"]
  );
});

test("std.data.last", () => {
  assert.equal(std.data.last([1, 2, 3]), 3);
  assert.throws(() => std.data.last("nope"), /last: expected array/);
  assert.throws(() => std.data.last([]), /last: empty array/);
});

test("std.data.scan", () => {
  const items = [1, 2, 3];
  const sums = std.data.scan(items, (state, item) => state + item, 0);
  assert.deepEqual(sums, [1, 3, 6]);

  const empty = std.data.scan([], (state) => state, { seed: 123 });
  assert.deepEqual(empty, []);

  const viaSeed = std.data.scan(items, (state, item) => state + item, { seed: 10 });
  assert.deepEqual(viaSeed, [11, 13, 16]);

  const running = std.data.scan(
    items,
    (state, item) => ({ sum: state.sum + item, max: Math.max(state.max, item) }),
    { seed: { sum: 0, max: Number.NEGATIVE_INFINITY } }
  );
  assert.deepEqual(running, [
    { sum: 1, max: 1 },
    { sum: 3, max: 2 },
    { sum: 6, max: 3 },
  ]);

  const objs = std.data.scan(
    ["a", "b"],
    (state, item, index) => ({ count: state.count + 1, item, index }),
    { seed: { count: 0, item: "", index: -1 } }
  );
  assert.deepEqual(objs, [
    { count: 1, item: "a", index: 0 },
    { count: 2, item: "b", index: 1 },
  ]);

  // Reducers may ignore trailing parameters.
  const ignored = std.data.scan([0, 0, 0], (state) => state + 1, { seed: 0 });
  assert.deepEqual(ignored, [1, 2, 3]);

  assert.throws(() => std.data.scan("nope", () => 0, 0), /scan: expected array items/);
  assert.throws(() => std.data.scan([], "nope", 0), /scan: expected reducer function/);

  // seedOrOptions object without own "seed" uses itself as the seed value.
  const seedObj = { count: 0 };
  const selfSeed = std.data.scan([1], (state, item) => ({ count: state.count + item }), seedObj);
  assert.deepEqual(selfSeed, [{ count: 1 }]);

  // "seed" present via prototype does not count as an own-property seed.
  const proto = { seed: { n: 1 } };
  const inherited = Object.create(proto);
  const inheritedSeed = std.data.scan([0], (state) => state, inherited);
  assert.equal(inheritedSeed[0], inherited);

  // seedOrOptions can be any non-object state value.
  const seedFn = () => 1;
  const fnSeed = std.data.scan([0], (state) => state, seedFn);
  assert.equal(fnSeed[0], seedFn);
});

test("std.table.col", () => {
  const rows = [
    { a: 1, b: "x" },
    { a: 2, b: "y" },
  ];
  assert.deepEqual(std.table.col(rows, "a"), [1, 2]);
  assert.deepEqual(std.table.col(rows, "missing"), [undefined, undefined]);
  assert.throws(() => std.table.col("nope", "a"), /col: expected rows array/);
  assert.throws(() => std.table.col(rows, ""), /col: expected key string/);
  assert.throws(() => std.table.col(rows, "__proto__"), /col: disallowed key/);
  assert.throws(() => std.table.col([null], "a"), /col: expected row objects/);
});

test("std.table.map", () => {
  const rows = [{ a: 2 }, { a: 3 }];
  const out = std.table.map(rows, (row, index) => ({ v: row.a * 10, index }));
  assert.deepEqual(out, [
    { v: 20, index: 0 },
    { v: 30, index: 1 },
  ]);
  assert.throws(() => std.table.map("nope", () => 0), /map: expected rows array/);
  assert.throws(() => std.table.map(rows, "nope"), /map: expected mapper function/);
  assert.throws(() => std.table.map([null], () => 0), /map: expected row objects/);
});

test("std.table.filter / std.table.sortBy", () => {
  const rows = [{ id: "a", n: 2 }, { id: "b", n: 1 }];
  assert.deepEqual(std.table.filter(rows, (r) => r.n > 1).map((r) => r.id), ["a"]);
  assert.deepEqual(std.table.sortBy(rows, "n").map((r) => r.id), ["b", "a"]);
  assert.throws(() => std.table.filter("nope", () => true), /filter: expected rows array/);
  assert.throws(() => std.table.filter(rows, "nope"), /filter: expected predicate function/);
  assert.throws(() => std.table.filter([null], () => true), /filter: expected row objects/);
});

test("std.table.sum", () => {
  const rows = [{ n: 1 }, { n: 2.5 }, { n: -3 }];
  assert.equal(std.table.sum(rows, "n"), 0.5);
  assert.throws(() => std.table.sum(rows, "__proto__"), /col: disallowed key/);
  assert.throws(() => std.table.sum([{ n: "x" }], "n"), /sum: expected finite numbers/);
  assert.throws(() => std.table.sum([{ n: Number.POSITIVE_INFINITY }], "n"), /sum: expected finite numbers/);
});

test("std.table.groupBy / std.table.agg", () => {
  const rows = [
    { id: "a", cat: "Food", amount: 10 },
    { id: "b", cat: "Travel", amount: 5 },
    { id: "c", cat: "Food", amount: 2 },
  ];

  const groups = std.table.groupBy(rows, "cat");
  assert.equal(groups.length, 2);
  assert.equal(groups[0].key, "Food");
  assert.equal(groups[0].rows.length, 2);
  assert.equal(groups[1].key, "Travel");

  const viaFn = std.table.groupBy(rows, (r) => r.cat);
  assert.deepEqual(viaFn.map((g) => g.key), ["Food", "Travel"]);

  const summary = std.table.agg(groups, (g) => ({
    cat: g.key,
    total: std.table.sum(g.rows, "amount"),
    count: g.rows.length,
  }));
  assert.deepEqual(
    summary.map((r) => Object.fromEntries(Object.entries(r))),
    [
      { cat: "Food", total: 12, count: 2 },
      { cat: "Travel", total: 5, count: 1 },
    ]
  );

  const numeric = std.table.groupBy(
    [
      { id: "x", n: 1 },
      { id: "y", n: 2 },
      { id: "z", n: 1 },
    ],
    "n"
  );
  assert.deepEqual(numeric.map((g) => g.key), [1, 2]);

  assert.throws(() => std.table.groupBy("nope", "cat"), /groupBy: expected rows array/);
  assert.throws(() => std.table.groupBy([null], "cat"), /groupBy: expected row objects/);
  assert.throws(() => std.table.groupBy(rows, 123), /groupBy: key must be a string or function/);
  assert.throws(() => std.table.groupBy(rows, "__proto__"), /groupBy: disallowed key/);
  assert.throws(() => std.table.groupBy(rows, () => ({})), /groupBy: key values must be strings or numbers/);
  assert.throws(
    () => std.table.groupBy(rows, () => Number.POSITIVE_INFINITY),
    /groupBy: key values must be finite numbers/
  );

  assert.throws(() => std.table.agg("nope", () => ({})), /agg: expected groups array/);
  assert.throws(() => std.table.agg(groups, "nope"), /agg: expected mapper function/);
  assert.throws(
    () => std.table.agg([{ key: "x", rows: [] }], () => 123),
    /agg: mapper must return an object/
  );
  assert.throws(
    () => std.table.agg([{ key: "x", rows: "nope" }], () => ({})),
    /agg: group.rows must be an array/
  );
  assert.throws(
    () => std.table.agg([{ key: Number.POSITIVE_INFINITY, rows: [] }], () => ({})),
    /agg: group.key must be string or finite number/
  );
  assert.throws(() => std.table.agg([null], () => ({})), /agg: expected group objects/);
  assert.throws(
    () => std.table.agg([{ key: {}, rows: [] }], () => ({})),
    /agg: group.key must be string or finite number/
  );
  assert.throws(
    () => std.table.agg([{ key: "x", rows: [] }], () => []),
    /agg: mapper must return an object/
  );
  assert.throws(
    () => std.table.agg([{ key: "x", rows: [] }], () => ({ ["__proto__"]: 1 })),
    /agg: disallowed key/
  );
});

test("std.table.join", () => {
  const left = [
    { id: "a", n: 1 },
    { id: "b", n: 2 },
  ];
  const right = [
    { id: "a", label: "A" },
    { id: "c", label: "C" },
  ];

  const inner = std.table.join(left, right, { leftKey: "id", rightKey: "id" });
  assert.deepEqual(inner.map((r) => Object.fromEntries(Object.entries(r))), [
    { id: "a", n: 1, right_id: "a", label: "A" },
  ]);

  const leftJoin = std.table.join(left, right, { leftKey: "id", rightKey: "id", how: "left" });
  assert.deepEqual(
    leftJoin.map((r) => Object.fromEntries(Object.entries(r))),
    [
      { id: "a", n: 1, right_id: "a", label: "A" },
      { id: "b", n: 2 },
    ]
  );

  const rightCollision = [{ id: "a", n: 999 }];
  const withPrefix = std.table.join(left, rightCollision, { leftKey: "id", rightKey: "id", rightPrefix: "r_" });
  assert.deepEqual(withPrefix.map((r) => Object.fromEntries(Object.entries(r))), [{ id: "a", n: 1, r_id: "a", r_n: 999 }]);

  // Collision after prefixing.
  assert.throws(
    () =>
      std.table.join([{ id: "a", right_id: "already" }], [{ id: "a" }], {
        leftKey: "id",
        rightKey: "id",
      }),
    /join: key collision/
  );

  // Numeric key join (covers numeric key paths).
  const joinedNum = std.table.join([{ id: 1, n: 1 }], [{ id: 1, label: "one" }], { leftKey: "id", rightKey: "id" });
  assert.deepEqual(joinedNum.map((r) => Object.fromEntries(Object.entries(r))), [{ id: 1, n: 1, right_id: 1, label: "one" }]);

  // Multiple matches for one left row.
  const multi = std.table.join(
    [{ id: "a", n: 1 }],
    [
      { id: "a", label: "A1" },
      { id: "a", label: "A2" },
    ],
    { leftKey: "id", rightKey: "id" }
  );
  assert.deepEqual(multi.map((r) => r.label), ["A1", "A2"]);

  assert.throws(() => std.table.join("nope", right, { leftKey: "id", rightKey: "id" }), /join: expected leftRows array/);
  assert.throws(() => std.table.join(left, "nope", { leftKey: "id", rightKey: "id" }), /join: expected rightRows array/);
  assert.throws(() => std.table.join(left, right, null), /join: expected opts object/);
  assert.throws(() => std.table.join(left, right, { leftKey: "", rightKey: "id" }), /join: expected key string/);
  assert.throws(() => std.table.join(left, right, { leftKey: 123, rightKey: "id" }), /join: leftKey must be string/);
  assert.throws(() => std.table.join(left, right, { leftKey: "id", rightKey: 123 }), /join: rightKey must be string/);
  assert.throws(() => std.table.join(left, right, { leftKey: "id", rightKey: "id", how: "nope" }), /join: how must be/);
  assert.throws(() => std.table.join([{ id: {} }], right, { leftKey: "id", rightKey: "id" }), /join: left key values must be string or finite number/);
  assert.throws(
    () => std.table.join(left, [{ id: {} }], { leftKey: "id", rightKey: "id" }),
    /join: right key values must be string or finite number/
  );
  assert.throws(() => std.table.join(left, [null], { leftKey: "id", rightKey: "id" }), /join: expected right row objects/);
  assert.throws(() => std.table.join([null], right, { leftKey: "id", rightKey: "id" }), /join: expected left row objects/);
});

test("std.lookup.index / std.lookup.get / std.lookup.xlookup", () => {
  const rows = [
    { code: "A", value: 10 },
    { code: "B", value: 20 },
    { code: "B", value: 21 },
  ];

  const idx = std.lookup.index(rows, "code");
  assert.deepEqual(std.lookup.get(idx, "A"), { code: "A", value: 10 });
  assert.deepEqual(std.lookup.get(idx, "B"), { code: "B", value: 20 });
  assert.throws(() => std.lookup.get(idx, "Z"), /lookup.get: key not found/);

  assert.equal(std.lookup.xlookup("A", rows, "code", "value"), 10);
  assert.equal(std.lookup.xlookup("Z", rows, "code", "value", 0), 0);
  assert.throws(() => std.lookup.xlookup("Z", rows, "code", "value"), /lookup.xlookup: key not found/);

  const nidx = std.lookup.index([{ id: 1, v: "one" }], "id");
  assert.deepEqual(std.lookup.get(nidx, 1), { id: 1, v: "one" });
  assert.throws(() => std.lookup.get(nidx, Number.POSITIVE_INFINITY), /lookup.get: key must be string or finite number/);

  assert.throws(() => std.lookup.index("nope", "code"), /lookup.index: expected rows array/);
  assert.throws(() => std.lookup.index(rows, 123), /lookup.index: keyColumn must be string/);
  assert.throws(() => std.lookup.index(rows, "__proto__"), /lookup.index: disallowed key/);
  assert.throws(() => std.lookup.index([null], "code"), /lookup.index: expected row objects/);
  assert.throws(() => std.lookup.index([{ code: {} }], "code"), /lookup.index: key values must be string or finite number/);

  assert.throws(() => std.lookup.get(null, "A"), /lookup.get: invalid index/);
  assert.throws(() => std.lookup.get(123, "A"), /lookup.get: invalid index/);

  // Cover the function-index path in asLookupIndex.
  const sym = Object.getOwnPropertySymbols(idx)[0];
  const fidx = () => {};
  fidx[sym] = idx[sym];
  assert.deepEqual(std.lookup.get(fidx, "A"), { code: "A", value: 10 });

  // Force an empty bucket to cover bucket.length===0.
  idx[sym].map.set("s:EMPTY", []);
  assert.throws(() => std.lookup.get(idx, "EMPTY"), /lookup.get: key not found/);

  assert.throws(() => std.lookup.get({}, "A"), /lookup.get: invalid index/);
  assert.throws(() => std.lookup.xlookup("A", "nope", "code", "value"), /lookup.xlookup: expected rows array/);
  assert.throws(() => std.lookup.xlookup("A", rows, 123, "value"), /lookup.xlookup: keyColumn must be string/);
  assert.throws(() => std.lookup.xlookup("A", rows, "code", 123), /lookup.xlookup: valueColumn must be string/);
  assert.throws(() => std.lookup.xlookup("A", rows, "__proto__", "value"), /lookup.xlookup: disallowed key/);
  assert.throws(() => std.lookup.xlookup("A", rows, "code", "__proto__"), /lookup.xlookup: disallowed key/);
  assert.throws(() => std.lookup.xlookup(Number.POSITIVE_INFINITY, rows, "code", "value"), /lookup.xlookup: key must be string or finite number/);
  assert.throws(() => std.lookup.xlookup("A", [null], "code", "value"), /lookup.xlookup: expected row objects/);
  assert.throws(() => std.lookup.xlookup("A", [{ code: {} }], "code", "value"), /lookup.xlookup: key values must be string or finite number/);
  assert.equal(std.lookup.xlookup("Z", rows, "code", "value", undefined), undefined);
});

test("std_shared.deepFreeze handles cycles deterministically", () => {
  const a = { x: 1 };
  a.self = a;
  deepFreeze(a);
  assert.ok(Object.isFrozen(a));
  assert.ok(Object.isFrozen(a.self));
  assert.equal(deepFreeze(1), 1);
  assert.equal(deepFreeze(null), null);
  const fn = () => {};
  deepFreeze(fn);
  assert.ok(Object.isFrozen(fn));
});

test("std.date.addMonths", () => {
  const d2023 = new Date(Date.UTC(2023, 0, 31));
  assert.equal(iso(std.date.addMonths(d2023, 1)), "2023-02-28");

  const d2024 = new Date(Date.UTC(2024, 0, 31));
  assert.equal(iso(std.date.addMonths(d2024, 1)), "2024-02-29");
  assert.equal(iso(std.date.addMonths(d2024, -1)), "2023-12-31");

  const dMarch = new Date(Date.UTC(2024, 2, 31));
  assert.equal(iso(std.date.addMonths(dMarch, 1)), "2024-04-30");

  const leap = new Date(Date.UTC(2024, 1, 29));
  assert.equal(iso(std.date.addMonths(leap, 12)), "2025-02-28");

  assert.throws(() => std.date.addMonths(new Date(Number.NaN), 1), /addMonths: invalid date/);
  assert.throws(() => std.date.addMonths(new Date(Date.UTC(2024, 0, 1)), 1.5), /addMonths: months must be integer/);
  assert.throws(() => std.date.addMonths(new Date(Date.UTC(2024, 0, 1)), Number.POSITIVE_INFINITY), /addMonths: months must be integer/);
});

test("std.date.parse / std.date.format", () => {
  const d = std.date.parse("2024-01-05");
  assert.equal(iso(d), "2024-01-05");
  assert.equal(std.date.format(d, "%Y-%m-%d"), "2024-01-05");
  assert.equal(std.date.format(d, "m=%m d=%d"), "m=01 d=05");
  assert.equal(std.date.format(d, "Year=%Y"), "Year=2024");
  assert.equal(std.date.format(d, "%%Y=%Y"), "%Y=2024");

  assert.throws(() => std.date.parse(123), /parse: expected ISO date string/);
  assert.throws(() => std.date.parse("2024/01/05"), /Invalid date/);
  assert.throws(() => std.date.format(new Date(Number.NaN), "%Y"), /format: invalid date/);
  assert.throws(() => std.date.format(d, 123), /format: expected template string/);
  assert.throws(() => std.date.format(d, "%"), /format: dangling %/);
  assert.throws(() => std.date.format(d, "%q"), /format: unsupported token/);
});

test("std.date.now / std.date.today (context)", () => {
  const ctx = createStd({ currentDateTime: new Date("2026-01-24T12:34:56.000Z") });
  const now1 = ctx.date.now();
  const now2 = ctx.date.now();
  assert.equal(now1.toISOString(), "2026-01-24T12:34:56.000Z");
  assert.equal(now2.getTime(), now1.getTime());

  const today = ctx.date.today();
  assert.equal(iso(today), "2026-01-24");
  assert.equal(today.getUTCHours(), 0);
  assert.equal(today.getUTCMinutes(), 0);
  assert.equal(today.getUTCSeconds(), 0);

  assert.throws(() => createStd({ currentDateTime: new Date(Number.NaN) }), /std: invalid currentDateTime/);
  assert.throws(() => createStd({ currentDateTime: undefined }), /std: invalid currentDateTime/);
});

test("std.date.now / std.date.today (default context)", () => {
  const now = std.date.now();
  assert.ok(now instanceof Date);
  assert.ok(Number.isFinite(now.getTime()));

  const today = std.date.today();
  assert.ok(today instanceof Date);
  assert.equal(today.getUTCHours(), 0);
  assert.equal(today.getUTCMinutes(), 0);
  assert.equal(today.getUTCSeconds(), 0);

  // Context object without an own currentDateTime key uses the system clock.
  const ctx = createStd({});
  assert.ok(Number.isFinite(ctx.date.now().getTime()));
});

test("std.finance.toMonthlyRate", () => {
  approxEqual(std.finance.toMonthlyRate(6.0), 0.06 / 12);
  assert.throws(() => std.finance.toMonthlyRate(Number.POSITIVE_INFINITY), /toMonthlyRate: annualPercent must be finite/);
});

test("std.finance.pmt", () => {
  const rate = std.finance.toMonthlyRate(5.0);
  const nper = 30 * 12;
  const pv = -300000;

  const payment = std.finance.pmt(rate, nper, pv);
  approxEqual(payment, 1610.4648690364195, 1e-9);

  // rate=0 special case
  assert.equal(std.finance.pmt(0, 10, -1000), 100);
  assert.equal(std.finance.pmt(0, 10, -1000, 100), 90);

  // fv affects the payment magnitude (non-zero rate).
  const withFv = std.finance.pmt(rate, 12, -1000, 500, 0);
  assert.ok(Number.isFinite(withFv));
  assert.ok(Math.abs(withFv) < 200, `Expected smaller magnitude payment, got ${withFv}`);

  // type affects the (1 + rate*type) term
  const pmt0 = std.finance.pmt(rate, nper, pv, 0, 0);
  const pmt1 = std.finance.pmt(rate, nper, pv, 0, 1);
  approxEqual(pmt1, pmt0 / (1 + rate), 1e-12);

  assert.throws(() => std.finance.pmt(Number.NaN, 10, 1), /pmt: invalid arguments/);
  assert.throws(() => std.finance.pmt(0.01, 10, 1, Number.NaN), /pmt: invalid arguments/);
  assert.throws(() => std.finance.pmt(0.01, 0, 1), /pmt: nper must be non-zero/);
  assert.throws(() => std.finance.pmt(0.01, 10, 1, 0, 2), /pmt: type must be 0 or 1/);
});

test("std.finance.ipmt / ppmt", () => {
  const rate = 0.1;
  const nper = 2;
  const pv = -1000;
  const payment = std.finance.pmt(rate, nper, pv);
  approxEqual(payment, 576.1904761904762, 1e-12);

  approxEqual(std.finance.ipmt(rate, 1, nper, pv), 100, 1e-12);
  approxEqual(std.finance.ppmt(rate, 1, nper, pv), payment - 100, 1e-12);
  approxEqual(std.finance.ipmt(rate, 1, nper, pv, 0, 0), std.finance.ipmt(rate, 1, nper, pv), 1e-12);
  approxEqual(std.finance.ppmt(rate, 1, nper, pv, 0, 0), std.finance.ppmt(rate, 1, nper, pv), 1e-12);

  approxEqual(std.finance.ipmt(rate, 2, nper, pv), 52.38095238095238, 1e-12);
  approxEqual(std.finance.ppmt(rate, 2, nper, pv), payment - 52.38095238095238, 1e-12);

  // type=1 (payments at beginning) implies ipmt(per=1)=0
  assert.equal(std.finance.ipmt(rate, 1, nper, pv, 0, 1), 0);
  assert.ok(Number.isFinite(std.finance.ipmt(rate, 2, nper, pv, 0, 1)));
  approxEqual(
    std.finance.ppmt(rate, 2, nper, pv, 0, 1),
    std.finance.pmt(rate, nper, pv, 0, 1) - std.finance.ipmt(rate, 2, nper, pv, 0, 1),
    1e-12
  );

  assert.throws(() => std.finance.ipmt(rate, 0, nper, pv), /per must be in \[1, nper\]/);
  assert.throws(() => std.finance.ipmt(rate, 3, nper, pv), /per must be in \[1, nper\]/);
  assert.throws(() => std.finance.ipmt(rate, 1, nper, pv, 0, 2), /type must be 0 or 1/);
  assert.throws(() => std.finance.ipmt(10, 1, 2, 1e308), /Non-finite numeric result/);
  assert.throws(() => std.finance.ipmt(rate, 1, 0, pv), /nper must be a positive integer/);
  assert.throws(() => std.finance.ppmt(rate, 1, 0, pv), /nper must be a positive integer/);
  assert.throws(() => std.finance.ipmt(rate, 1.2, nper, pv), /per must be an integer/);
  assert.throws(() => std.finance.ipmt(rate, 1, 2.5, pv), /nper must be an integer/);
  assert.throws(() => std.finance.npv("x", [1]), /rate must be finite/);

  // per > 2 covers the type=1 balance update path
  const nper3 = 3;
  const pmt1 = std.finance.pmt(rate, nper3, pv, 0, 1);
  assert.ok(Number.isFinite(std.finance.ipmt(rate, 3, nper3, pv, 0, 1)));
  approxEqual(
    std.finance.ppmt(rate, 3, nper3, pv, 0, 1),
    pmt1 - std.finance.ipmt(rate, 3, nper3, pv, 0, 1),
    1e-12
  );
});

test("std.finance.npv / irr", () => {
  const r = 0.1;
  const cfs = [100, 100, 100];
  const expected = cfs.reduce((acc, cf, i) => acc + cf / (1 + r) ** (i + 1), 0);
  approxEqual(std.finance.npv(r, cfs), expected, 1e-12);
  assert.throws(() => std.finance.npv(1e308, [1, 1]), /npv: invalid discount rate/);
  assert.throws(() => std.finance.npv(r, [1, Number.NaN]), /npv: expected finite number array/);
  assert.throws(() => std.finance.npv(r, [1, "x"]), /npv: expected finite number array/);
  assert.throws(() => std.finance.npv(-0.9999, new Array(100).fill(0)), /npv: invalid discount rate/);

  approxEqual(std.finance.irr([-100, 110]), 0.1, 1e-9);
  approxEqual(std.finance.irr([-100, 110], 0.2), 0.1, 1e-9);
  approxEqual(std.finance.irr([-100, 500, -500], 1), (3 - Math.sqrt(5)) / 2, 1e-9);
  approxEqual(std.finance.irr([-1000, 1600]), 0.6, 1e-12);
  approxEqual(std.finance.irr([-100, 135]), 0.35, 1e-12);
  approxEqual(std.finance.irr([-1, 0.0001]), -0.9999, 1e-12);
  approxEqual(std.finance.irr([100, -135]), 0.35, 1e-12);
  assert.throws(() => std.finance.irr([100, 110]), /irr: cashflows must include both positive and negative values/);
  assert.throws(() => std.finance.irr([-100, -110]), /irr: cashflows must include both positive and negative values/);
  assert.throws(() => std.finance.irr("nope"), /irr: expected cashflows array/);
  assert.throws(() => std.finance.irr([-1]), /irr: cashflows must have at least 2 values/);
  assert.throws(() => std.finance.irr([-1, Number.NaN]), /irr: expected finite number array/);
  assert.throws(() => std.finance.irr([-1, "x"]), /irr: expected finite number array/);
  assert.throws(() => std.finance.irr([-100, 110], Number.NaN), /rate must be finite/);
  assert.throws(() => std.finance.irr([-100, 110], -2), /rate must be > -1/);
  assert.throws(() => std.finance.irr([-1, 1e10]), /irr: could not find a root/);
  assert.throws(() => std.finance.npv(r, "nope"), /npv: expected cashflows array/);

  const longCashflows = [-1, 1, ...new Array(298).fill(0)];
  assert.equal(longCashflows.length, 300);
  approxEqual(std.finance.irr(longCashflows, 10), 0, 1e-12);

  const exactCandidateCashflows = new Array(601).fill(0);
  exactCandidateCashflows[0] = -1;
  exactCandidateCashflows[600] = 2 ** -600;
  assert.equal(std.finance.irr(exactCandidateCashflows), -0.5);

  // Trigger candidate overflow/underflow handling while still finding a root.
  const far = 199;
  const farCashflows = [-100, ...new Array(far - 1).fill(0), 1];
  const farExpected = 0.01 ** (1 / far) - 1;
  approxEqual(std.finance.irr(farCashflows), farExpected, 1e-9);

  const lateOverflowCashflows = new Array(201).fill(0);
  lateOverflowCashflows[0] = 1;
  lateOverflowCashflows[1] = -1e-6;
  lateOverflowCashflows[200] = 1;
  assert.throws(() => std.finance.irr(lateOverflowCashflows), /irr: could not find a root/);
});

test("std.assert.that", () => {
  std.assert.that(true);
  assert.throws(() => std.assert.that(false), /Assertion failed/);
  assert.throws(() => std.assert.that(false, "nope"), /nope/);
});

test("std.logic.cond / coalesce / isPresent / where", () => {
  assert.equal(std.logic.cond(true, 1, 0), 1);
  assert.equal(std.logic.cond(false, 1, true, 2, 0), 2);
  assert.equal(std.logic.cond(false, 1, false, 2, "d"), "d");
  assert.throws(() => std.logic.cond(), /cond: expected arguments/);
  assert.throws(() => std.logic.cond(true, 1), /cond: expected condition\/value pairs plus a default value/);
  assert.throws(() => std.logic.cond("nope", 1, 0), /cond: conditions must be boolean/);

  assert.equal(std.logic.coalesce(null, undefined, 1, 2), 1);
  assert.equal(std.logic.coalesce(undefined, null), null);
  assert.deepEqual(std.logic.coalesce([null, 2], [1, null]), [1, 2]);
  assert.deepEqual(std.logic.coalesce([null, 2], 5), [5, 2]);
  assert.deepEqual(std.logic.coalesce(5, [null, 2]), [5, 5]);
  assert.throws(() => std.logic.coalesce(), /coalesce: expected at least 1 value/);
  assert.throws(() => std.logic.coalesce([1], [1, 2]), /coalesce: array length mismatch/);

  assert.equal(std.logic.isPresent(null), false);
  assert.equal(std.logic.isPresent(0), true);
  assert.deepEqual(std.logic.isPresent([null, 1, undefined]), [false, true, false]);

  assert.equal(std.logic.where(true, 1, 2), 1);
  assert.deepEqual(std.logic.where([true, false], [1, 2], 9), [1, 9]);
  assert.throws(() => std.logic.where(1, 1, 2), /where: test must be boolean/);
  assert.throws(() => std.logic.where([true, "x"], 1, 2), /where: test must be boolean/);
  assert.throws(() => std.logic.where([true], [1, 2], 3), /where: array length mismatch/);
});

test("std.array utilities", () => {
  assert.deepEqual(std.array.take([1, 2, 3], 2), [1, 2]);
  assert.deepEqual(std.array.take([1], 5), [1]);
  assert.throws(() => std.array.take("nope", 1), /take: expected array/);
  assert.throws(() => std.array.take([1], -1), /take: n must be a non-negative integer/);
  assert.throws(() => std.array.take([1], "x"), /take: n must be a non-negative integer/);

  assert.deepEqual(std.array.drop([1, 2, 3], 2), [3]);
  assert.deepEqual(std.array.drop([1], 5), []);
  assert.throws(() => std.array.drop([1], 1.5), /drop: n must be a non-negative integer/);
  assert.throws(() => std.array.drop([1], Number.POSITIVE_INFINITY), /drop: n must be a non-negative integer/);

  assert.deepEqual(std.array.concat([1], [2, 3]), [1, 2, 3]);
  assert.throws(() => std.array.concat([1], "x"), /concat: expected array/);

  assert.deepEqual(std.array.zip([1, 2], ["a", "b"]), [
    [1, "a"],
    [2, "b"],
  ]);
  assert.deepEqual(std.array.zip([], []), []);
  assert.throws(() => std.array.zip([1], [1, 2]), /zip: array length mismatch/);

  assert.deepEqual(std.array.flatten([1, [2, 3], 4]), [1, 2, 3, 4]);
  assert.deepEqual(std.array.flatten([]), []);
  assert.throws(() => std.array.flatten("nope"), /flatten: expected array/);

  assert.equal(std.array.at([10, 20, 30], 0), 10);
  assert.equal(std.array.at([10, 20, 30], -1), 30);
  assert.equal(std.array.at([10, 20, 30], 99), null);
  assert.equal(std.array.at([10, 20, 30], -99), null);
  assert.throws(() => std.array.at([1], 1.5), /at: index must be an integer/);
  assert.throws(() => std.array.at([1], "x"), /at: index must be an integer/);
  assert.throws(() => std.array.at([1], Number.POSITIVE_INFINITY), /at: index must be an integer/);

  const d0 = new Date(Date.UTC(2024, 0, 1));
  const d1 = new Date(Date.UTC(2024, 0, 2));
  assert.equal(std.array.indexOf([1, 2, 3], 2), 1);
  assert.equal(std.array.indexOf(["a", "b"], "b"), 1);
  assert.equal(std.array.indexOf([true, false], false), 1);
  assert.equal(std.array.indexOf([null, 1], null), 0);
  assert.equal(std.array.indexOf([undefined, 1], undefined), 0);
  assert.equal(std.array.indexOf([d0, d1], new Date(Date.UTC(2024, 0, 2))), 1);
  assert.equal(std.array.indexOf([1, 2, 3], 4), -1);
  assert.equal(std.array.indexOf([], 1), -1);
  assert.throws(() => std.array.indexOf([1], Number.POSITIVE_INFINITY), /indexOf: expected finite numbers/);
  assert.throws(() => std.array.indexOf([1], { x: 1 }), /indexOf: expected comparable scalars/);
  assert.throws(() => std.array.indexOf([{}], 1), /indexOf: expected comparable scalars/);

  assert.equal(std.array.find([1, 2, 3], (x) => x > 1), 2);
  assert.equal(std.array.find([1, 2, 3], (x) => x > 9), null);
  assert.equal(std.array.find([], () => true), null);
  assert.throws(() => std.array.find([1], 123), /find: expected predicate function/);
  assert.throws(() => std.array.find([1], () => 1), /find: predicate must return boolean/);

  assert.equal(std.array.some([1, 2, 3], (x) => x === 2), true);
  assert.equal(std.array.some([1, 2, 3], (x) => x === 9), false);
  assert.equal(std.array.some([], () => true), false);
  assert.equal(std.array.every([1, 2, 3], (x) => x > 0), true);
  assert.equal(std.array.every([1, 2, 3], (x) => x > 2), false);
  assert.equal(std.array.every([], () => true), true);
  assert.throws(() => std.array.some([1], () => 1), /some: predicate must return boolean/);
  assert.throws(() => std.array.some([1], "nope"), /some: expected predicate function/);
  assert.throws(() => std.array.every([1], "nope"), /every: expected predicate function/);
  assert.throws(() => std.array.every([1], () => "nope"), /every: predicate must return boolean/);

  assert.deepEqual(std.array.distinct([1, 1, 2, 1, 3]), [1, 2, 3]);
  assert.deepEqual(std.array.distinct([d0, d0, d1]), [d0, d1]);
  assert.deepEqual(std.array.distinct([]), []);
  assert.throws(() => std.array.distinct([new Date(Number.NaN)]), /distinct: invalid date/);
  assert.throws(() => std.array.distinct([{}]), /distinct: expected comparable scalars/);

  assert.equal(std.array.product([2, 3, 4]), 24);
  assert.throws(() => std.array.product([]), /product: empty array/);
  assert.throws(() => std.array.product([1, Number.NaN]), /product: expected finite number array/);
  assert.throws(() => std.array.product([1, "2"]), /product: expected finite number array/);
  assert.throws(() => std.array.product([1e308, 1e308]), /Non-finite numeric result/);

  const rows = [
    { cat: "a" },
    { cat: "a" },
    { cat: "b" },
  ];
  assert.deepEqual(Object.assign({}, std.array.countBy(rows, "cat")), { a: 2, b: 1 });
  const rowsWithNumber = [...rows, { cat: 1 }];
  assert.deepEqual(Object.assign({}, std.array.countBy(rowsWithNumber, "cat")), { a: 2, b: 1, 1: 1 });
  assert.deepEqual(Object.assign({}, std.array.countBy([], "cat")), {});
  assert.throws(() => std.array.countBy(rows, 1), /countBy: expected key string/);
  assert.throws(() => std.array.countBy(rows, ""), /countBy: expected key string/);
  assert.throws(() => std.array.countBy([1, 2], "x"), /countBy: expected row objects/);
  assert.throws(() => std.array.countBy([[]], "x"), /countBy: expected row objects/);
  assert.throws(() => std.array.countBy([null], "x"), /countBy: expected row objects/);
  assert.throws(() => std.array.countBy([{ x: 1 }], "cat"), /countBy: missing key: cat/);
  assert.throws(
    () => std.array.countBy([{ cat: Number.POSITIVE_INFINITY }], "cat"),
    /countBy: key values must be string or finite number/
  );
  assert.throws(() => std.array.countBy([{ cat: {} }], "cat"), /countBy: key values must be string or finite number/);
  assert.throws(() => std.array.countBy([{ cat: "__proto__" }], "cat"), /disallowed key/);
});

test("std.stats helpers", () => {
  assert.equal(std.stats.median([3, 1, 2]), 2);
  assert.equal(std.stats.median([1, 2, 3, 4]), 2.5);
  assert.throws(() => std.stats.median([]), /median: expected at least 1 values/);
  assert.throws(() => std.stats.median("nope"), /median: expected array/);
  assert.throws(() => std.stats.median([1, "2"]), /median: expected finite number array/);

  assert.equal(std.stats.variance([1, 2, 3]), 1);
  assert.equal(std.stats.stdev([1, 2, 3]), 1);
  assert.throws(() => std.stats.variance([1]), /variance: expected at least 2 values/);
  assert.throws(() => std.stats.variance("nope"), /variance: expected array/);
  assert.throws(() => std.stats.variance([1, Number.NaN]), /variance: expected finite number array/);
  assert.throws(() => std.stats.variance([-1e308, 1e308]), /Non-finite numeric result/);

  assert.equal(std.stats.percentile([10], 50), 10);
  assert.equal(std.stats.percentile([0, 10], 0), 0);
  assert.equal(std.stats.percentile([0, 10], 100), 10);
  assert.equal(std.stats.percentile([0, 10], 50), 5);
  assert.throws(() => std.stats.percentile([1, 2, 3], -1), /percentile: p must be a finite number in \[0, 100\]/);
  assert.throws(() => std.stats.percentile([1, 2, 3], "x"), /percentile: p must be a finite number in \[0, 100\]/);
  assert.throws(
    () => std.stats.percentile([1, 2, 3], Number.POSITIVE_INFINITY),
    /percentile: p must be a finite number in \[0, 100\]/
  );
  assert.throws(() => std.stats.percentile([1, 2, 3], 101), /percentile: p must be a finite number in \[0, 100\]/);
  assert.throws(() => std.stats.percentile([-1e308, 1e308], 50), /Non-finite numeric result/);

  assert.deepEqual(std.stats.quartiles([0, 10, 20, 30]), [7.5, 15, 22.5]);

  assert.equal(std.stats.covariance([1, 2, 3], [1, 2, 3]), 1);
  assert.throws(() => std.stats.covariance([1, 2], [1, 2, 3]), /covariance: array length mismatch/);
  assert.throws(() => std.stats.covariance([-1e308, 1e308], [-1e308, 1e308]), /Non-finite numeric result/);
  assert.equal(std.stats.correlation([1, 2, 3], [1, 2, 3]), 1);
  assert.throws(() => std.stats.correlation([1, 1, 1], [1, 2, 3]), /correlation: undefined/);
  assert.throws(() => std.stats.correlation([1, 2, 3], [5, 5, 5]), /correlation: undefined/);

  const fit = std.stats.linearFit([0, 1, 2], [0, 2, 4]);
  assert.equal(Object.getPrototypeOf(fit), null);
  approxEqual(fit.slope, 2, 1e-12);
  approxEqual(fit.intercept, 0, 1e-12);
  approxEqual(fit.r2, 1, 1e-12);
  approxEqual(std.stats.predict(fit, 3), 6, 1e-12);

  const flat = std.stats.linearFit([0, 1, 2], [5, 5, 5]);
  approxEqual(flat.slope, 0, 1e-12);
  approxEqual(flat.intercept, 5, 1e-12);
  assert.equal(flat.r2, 1);

  assert.throws(() => std.stats.linearFit([0, 1, 2], [1e308, -1e308, 1e308]), /Non-finite numeric result/);
  assert.throws(() => std.stats.linearFit([0, 1], [-1e308, 1e308]), /Non-finite numeric result/);
  assert.throws(() => std.stats.linearFit([1, 1], [1, 2]), /linearFit: xs has zero variance/);
  assert.throws(() => std.stats.predict(null, 1), /predict: expected fit object/);
  assert.throws(() => std.stats.predict(1, 1), /predict: expected fit object/);
  assert.throws(() => std.stats.predict({ slope: "x", intercept: 0 }, 1), /predict: slope must be finite/);
  assert.throws(() => std.stats.predict({ slope: Number.POSITIVE_INFINITY, intercept: 0 }, 1), /predict: slope must be finite/);
  assert.throws(() => std.stats.predict({ slope: 1, intercept: "x" }, 1), /predict: intercept must be finite/);
  assert.throws(() => std.stats.predict({ slope: 1, intercept: Number.NaN }, 1), /predict: intercept must be finite/);
  assert.throws(() => std.stats.predict({ slope: 1, intercept: 0 }, Number.NaN), /predict: x must be finite/);
  assert.throws(() => std.stats.predict({ slope: 1, intercept: 0 }, "x"), /predict: x must be finite/);
  assert.throws(() => std.stats.predict({ slope: 1e308, intercept: 1e308 }, 2), /Non-finite numeric result/);
});

test("std.date extensions", () => {
  const d = new Date(Date.UTC(2024, 0, 2)); // Tue
  assert.equal(std.date.year(d), 2024);
  assert.equal(std.date.month(d), 1);
  assert.equal(std.date.day(d), 2);
  assert.equal(std.date.quarter(d), 1);
  assert.equal(std.date.weekday(d), 2);
  assert.throws(() => std.date.weekday(new Date(Number.NaN)), /weekday: invalid date/);

  assert.equal(iso(std.date.addDays(d, 5)), "2024-01-07");
  assert.throws(() => std.date.addDays(d, 1.5), /addDays: days must be integer/);

  assert.equal(iso(std.date.addYears(new Date(Date.UTC(2024, 1, 29)), 1)), "2025-02-28");
  assert.throws(() => std.date.addYears(d, Number.POSITIVE_INFINITY), /addYears: years must be integer/);

  assert.equal(std.date.diffDays(new Date(Date.UTC(2024, 0, 1, 12)), new Date(Date.UTC(2024, 0, 3, 3))), 2);
  assert.equal(std.date.diffMonths(new Date(Date.UTC(2024, 0, 31)), new Date(Date.UTC(2024, 2, 1))), 2);

  assert.equal(iso(std.date.startOfMonth(new Date(Date.UTC(2024, 6, 15)))), "2024-07-01");
  assert.equal(iso(std.date.endOfMonth(new Date(Date.UTC(2024, 1, 10)))), "2024-02-29");
  assert.equal(iso(std.date.startOfQuarter(new Date(Date.UTC(2024, 4, 10)))), "2024-04-01");

  assert.deepEqual(std.date.monthRange(new Date(Date.UTC(2024, 0, 2)), new Date(Date.UTC(2024, 2, 15))).map(iso), [
    "2024-01-01",
    "2024-02-01",
    "2024-03-01",
  ]);
  assert.throws(
    () => std.date.monthRange(new Date(Date.UTC(2024, 2, 1)), new Date(Date.UTC(2024, 0, 1))),
    /monthRange: end must be on or after start/
  );

  assert.deepEqual(std.date.workdays(new Date(Date.UTC(2024, 0, 5)), new Date(Date.UTC(2024, 0, 8))).map(iso), [
    "2024-01-05",
    "2024-01-08",
  ]);
  assert.throws(
    () => std.date.workdays(new Date(Date.UTC(2024, 0, 10)), new Date(Date.UTC(2024, 0, 1))),
    /workdays: end must be on or after start/
  );
});
