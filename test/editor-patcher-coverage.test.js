import assert from "node:assert/strict";
import { test } from "node:test";

import { applyPatch, buildSourceMap } from "../dist/editor/patcher.js";

function type(name, args = []) {
  return { name, args, raw: args.length ? `${name}(${args.join(",")})` : name };
}

function input(name, line, t, defaultValue = 0) {
  return { name, line, type: t, defaultText: String(defaultValue), defaultValue };
}

function table(name, primaryKey = "id", source = undefined) {
  return {
    name,
    primaryKey,
    columns: {
      id: type("string"),
      qty: type("integer"),
      amount: type("currency", ["ISK"]),
      note: type("string"),
      when: type("date"),
      at: type("datetime"),
    },
    rows: [],
    ...(source ? { source } : {}),
    line: 1,
  };
}

test("editor patcher: buildSourceMap filters malformed rowMap entries", () => {
  const program = {
    inputs: [input("x", 1, type("integer"), 1)],
    tables: [
      {
        ...table("items"),
        rowMap: [
          { primaryKey: "a", line: 10 },
          null,
          { primaryKey: "", line: 11 },
          { primaryKey: "b", line: Number.NaN },
          { primaryKey: "c", line: 12 },
        ],
      },
    ],
  };

  const map = buildSourceMap(program);
  const entry = map.tablesByName.get("items");
  assert.ok(entry);
  assert.deepEqual(Array.from(entry.rowLineByPk.entries()), [
    ["a", 10],
    ["c", 12],
  ]);
});

test("editor patcher: updateInput coercion for booleans, numbers, dates, and fallback JSON", () => {
  const source = [
    "b : boolean = false",
    "i : integer = 1",
    "n : number = 1.2",
    "c : currency[ISK] = 1",
    "d : date = 2025-01-01",
    "dt : datetime = 2025-01-01T00:00:00Z",
    "s : string = \"a\"",
    "u : custom = 0",
  ].join("\r\n");

  const map = buildSourceMap({
    inputs: [
      input("b", 1, type("boolean"), false),
      input("i", 2, type("integer"), 1),
      input("n", 3, type("number"), 1.2),
      input("c", 4, type("currency", ["ISK"]), 1),
      input("d", 5, type("date"), "2025-01-01"),
      input("dt", 6, type("datetime"), "2025-01-01T00:00:00Z"),
      input("s", 7, type("string"), "a"),
      input("u", 8, type("custom"), 0),
    ],
    tables: [],
  });

  let next = source;
  next = applyPatch(next, { kind: "updateInput", name: "b", value: "1" }, map);
  next = applyPatch(next, { kind: "updateInput", name: "i", value: 2.9 }, map);
  next = applyPatch(next, { kind: "updateInput", name: "n", value: "3.5" }, map);
  next = applyPatch(next, { kind: "updateInput", name: "c", value: 10.6 }, map);
  next = applyPatch(next, { kind: "updateInput", name: "d", value: new Date("2025-03-04T00:00:00Z") }, map);
  next = applyPatch(next, { kind: "updateInput", name: "dt", value: new Date("2025-03-04T01:02:03Z") }, map);
  next = applyPatch(next, { kind: "updateInput", name: "s", value: 123 }, map);
  next = applyPatch(next, { kind: "updateInput", name: "u", value: { a: 1 } }, map);

  assert.match(next, /b : boolean = true/);
  assert.match(next, /i : integer = 2/);
  assert.match(next, /n : number = 3.5/);
  assert.match(next, /c : currency\[ISK\] = 11/);
  assert.match(next, /d : date = 2025-03-04/);
  assert.match(next, /dt : datetime = 2025-03-04T01:02:03.000Z/);
  assert.match(next, /s : string = "123"/);
  assert.match(next, /u : custom = \{"a":1\}/);
  assert.ok(next.includes("\r\n"));

  assert.throws(() => applyPatch(source, { kind: "updateInput", name: "missing", value: 1 }, map), /Input not found/);

  const badLineMap = buildSourceMap({ inputs: [input("z", 99, type("integer"), 0)], tables: [] });
  assert.throws(() => applyPatch(source, { kind: "updateInput", name: "z", value: 1 }, badLineMap), /line out of range/);

  const noEqSource = "x : integer 1";
  const noEqMap = buildSourceMap({ inputs: [input("x", 1, type("integer"), 1)], tables: [] });
  assert.throws(() => applyPatch(noEqSource, { kind: "updateInput", name: "x", value: 2 }, noEqMap), /Could not find '='/);

  assert.throws(() => applyPatch(source, { kind: "updateInput", name: "b", value: "x" }, map), /Expected boolean value/);
  assert.throws(() => applyPatch(source, { kind: "updateInput", name: "d", value: 1 }, map), /Expected date value/);
});

test("editor patcher: updateTableCell validates selectors, row JSON, schema, and type coercion", () => {
  const mkMap = (src, rowMapEntries, tableOverrides = {}) => ({
    source: src,
    map: {
      inputsByName: new Map(),
      tablesByName: new Map([
        [
          "items",
          {
            table: { ...table("items"), ...tableOverrides },
            rowLineByPk: new Map(rowMapEntries),
          },
        ],
      ]),
    },
  });

  assert.throws(
    () => applyPatch("", { kind: "updateTableCell", tableName: "missing", primaryKey: "a", column: "qty", value: 1 }, { inputsByName: new Map(), tablesByName: new Map() }),
    /Table not found/
  );

  const external = mkMap('{"id":"a","qty":1}', [["a", 1]], {
    source: { uri: "x.csv", format: "csv", hash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
  });
  assert.throws(
    () => applyPatch(external.source, { kind: "updateTableCell", tableName: "items", primaryKey: "a", column: "qty", value: 2 }, external.map),
    /read-only/
  );

  const base = mkMap('{"id":"a","qty":1,"amount":10,"note":"x"}\n{"id":"b","qty":2,"amount":20}', [
    ["a", 1],
    ["b", 2],
  ]);

  assert.throws(
    () => applyPatch(base.source, { kind: "updateTableCell", tableName: "items", primaryKey: null, column: "qty", value: 1 }, base.map),
    /Invalid primaryKey/
  );
  assert.throws(
    () => applyPatch(base.source, { kind: "updateTableCell", tableName: "items", primaryKey: "z", column: "qty", value: 1 }, base.map),
    /Row not found/
  );

  const outOfRange = mkMap(base.source, [["a", 999]]);
  assert.throws(
    () => applyPatch(outOfRange.source, { kind: "updateTableCell", tableName: "items", primaryKey: "a", column: "qty", value: 1 }, outOfRange.map),
    /line out of range/
  );

  const emptyRow = mkMap("   \n", [["a", 1]]);
  assert.throws(
    () => applyPatch(emptyRow.source, { kind: "updateTableCell", tableName: "items", primaryKey: "a", column: "qty", value: 1 }, emptyRow.map),
    /Empty JSONL row/
  );

  const badJson = mkMap("not-json\n", [["a", 1]]);
  assert.throws(
    () => applyPatch(badJson.source, { kind: "updateTableCell", tableName: "items", primaryKey: "a", column: "qty", value: 1 }, badJson.map),
    /Invalid JSONL row/
  );

  const notObject = mkMap("[1,2,3]\n", [["a", 1]]);
  assert.throws(
    () => applyPatch(notObject.source, { kind: "updateTableCell", tableName: "items", primaryKey: "a", column: "qty", value: 1 }, notObject.map),
    /must be an object/
  );

  const missingPk = mkMap('{"qty":1}\n', [["a", 1]]);
  assert.throws(
    () => applyPatch(missingPk.source, { kind: "updateTableCell", tableName: "items", primaryKey: "a", column: "qty", value: 1 }, missingPk.map),
    /missing primaryKey/
  );

  const mismatchPk = mkMap('{"id":"z","qty":1}\n', [["a", 1]]);
  assert.throws(
    () => applyPatch(mismatchPk.source, { kind: "updateTableCell", tableName: "items", primaryKey: "a", column: "qty", value: 1 }, mismatchPk.map),
    /primaryKey mismatch/
  );

  assert.throws(
    () => applyPatch(base.source, { kind: "updateTableCell", tableName: "items", primaryKey: "a", column: "missing", value: 1 }, base.map),
    /Unknown column/
  );
  assert.throws(
    () => applyPatch(base.source, { kind: "updateTableCell", tableName: "items", primaryKey: "a", column: "id", value: "new" }, base.map),
    /Editing primaryKey/
  );
  assert.throws(
    () => applyPatch(base.source, { kind: "updateTableCell", tableName: "items", primaryKey: "a", column: "qty", value: "oops" }, base.map),
    /Expected integer value/
  );

  let next = applyPatch(base.source, { kind: "updateTableCell", tableName: "items", primaryKey: "a", column: "amount", value: 19.6 }, base.map);
  next = applyPatch(next, { kind: "updateTableCell", tableName: "items", primaryKey: "b", column: "when", value: "2025-03-04" }, base.map);
  next = applyPatch(next, { kind: "updateTableCell", tableName: "items", primaryKey: "b", column: "at", value: new Date("2025-03-04T12:13:14Z") }, base.map);
  assert.match(next, /"id":"a","qty":1,"amount":20,"note":"x"/);
  assert.match(next, /"id":"b","qty":2,"amount":20,"when":"2025-03-04","at":"2025-03-04T12:13:14.000Z"/);
});
