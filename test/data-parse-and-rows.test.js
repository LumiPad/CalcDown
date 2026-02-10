import assert from "node:assert/strict";
import { test } from "node:test";

import { parseDataHeaderLines } from "../dist/data_header.js";
import { parseDataBlock } from "../dist/data_parse.js";
import { coerceRowsToTable, parseInlineJsonlRows } from "../dist/data_rows.js";
import { isIdent, parseScalarByType, parseType } from "../dist/data_types.js";
import { parseCsv } from "../dist/util/csv.js";

function block(content, fenceLine = 10, lang = "data") {
  return { kind: "code", lang, content, fenceLine };
}

function codes(messages) {
  return messages.map((m) => m.code);
}

function toPlainRows(rows) {
  return rows.map((row) => ({ ...row }));
}

test("data_types: parseType + scalar coercion + identifier checks", () => {
  const usd = parseType("currency[usd]");
  assert.equal(usd.name, "currency");
  assert.deepEqual(usd.args, ["USD"]);

  const isk = parseType("currency('isk')");
  assert.equal(isk.name, "currency");
  assert.deepEqual(isk.args, ["ISK"]);

  const malformed = parseType("number(");
  assert.equal(malformed.name, "number(");
  assert.deepEqual(malformed.args, []);

  assert.equal(parseScalarByType({ name: "string", args: [], raw: "string" }, "ok"), "ok");
  assert.throws(
    () => parseScalarByType({ name: "string", args: [], raw: "string" }, 1),
    /Expected string/
  );

  assert.equal(parseScalarByType({ name: "boolean", args: [], raw: "boolean" }, true), true);
  assert.throws(
    () => parseScalarByType({ name: "boolean", args: [], raw: "boolean" }, "true"),
    /Expected boolean/
  );

  assert.equal(parseScalarByType({ name: "integer", args: [], raw: "integer" }, 7), 7);
  assert.throws(
    () => parseScalarByType({ name: "integer", args: [], raw: "integer" }, 7.1),
    /Expected integer/
  );

  assert.equal(parseScalarByType({ name: "number", args: [], raw: "number" }, 1.5), 1.5);
  assert.equal(parseScalarByType({ name: "percent", args: [], raw: "percent" }, 0.2), 0.2);
  assert.throws(
    () => parseScalarByType({ name: "number", args: [], raw: "number" }, "1"),
    /Expected number/
  );

  assert.equal(parseScalarByType({ name: "currency", args: ["ISK"], raw: "currency[ISK]" }, 154.6), 155);
  assert.equal(parseScalarByType({ name: "currency", args: ["USD"], raw: "currency[USD]" }, 154.6), 154.6);

  const d = parseScalarByType({ name: "date", args: [], raw: "date" }, "2025-03-04");
  assert.ok(d instanceof Date);
  assert.equal(d.toISOString().slice(0, 10), "2025-03-04");
  assert.throws(
    () => parseScalarByType({ name: "date", args: [], raw: "date" }, 1),
    /Expected ISO date string/
  );

  const dt = parseScalarByType({ name: "datetime", args: [], raw: "datetime" }, "2025-03-04T10:11:12Z");
  assert.ok(dt instanceof Date);
  assert.throws(
    () => parseScalarByType({ name: "datetime", args: [], raw: "datetime" }, "not-a-date"),
    /Invalid datetime/
  );

  assert.equal(parseScalarByType({ name: "custom", args: [], raw: "custom" }, "x"), "x");

  assert.equal(isIdent("abc_123"), true);
  assert.equal(isIdent("123abc"), false);
});

test("data_header: parses known keys and reports invalid/unknown lines", () => {
  const b = block("", 30);
  const res = parseDataHeaderLines(b, [
    undefined,
    "",
    "# header comment",
    "name: revenue",
    "primaryKey: id",
    "sortBy: bad-key",
    "source: ./rows.csv",
    "format: csv",
    "hash: sha256:abc",
    "unknown: value",
    "columns:",
    undefined,
    "  # columns comment",
    "  id: string",
    "  amount: currency[isk]",
    "\tflag: boolean",
    "  bad entry",
    "another: key",
    "not a mapping line",
  ]);

  assert.equal(res.header.name, "revenue");
  assert.equal(res.header.primaryKey, "id");
  assert.equal(res.header.sourceUri, "./rows.csv");
  assert.equal(res.header.sourceFormatRaw, "csv");
  assert.equal(res.header.sourceHash, "sha256:abc");
  assert.equal(res.header.columns.id.name, "string");
  assert.equal(res.header.columns.amount.name, "currency");
  assert.deepEqual(res.header.columns.amount.args, ["ISK"]);

  const found = new Set(codes(res.messages));
  assert.ok(found.has("CD_DATA_HEADER_UNKNOWN_KEY"));
  assert.ok(found.has("CD_DATA_COLUMNS_INVALID_ENTRY"));
  assert.ok(found.has("CD_DATA_HEADER_INVALID_LINE"));
});

test("data_rows: coerceRowsToTable validates row shape, PK rules, and typed values", () => {
  const columns = {
    id: { name: "string", args: [], raw: "string" },
    qty: { name: "integer", args: [], raw: "integer" },
    amount: { name: "currency", args: ["ISK"], raw: "currency[ISK]" },
  };

  const res = coerceRowsToTable(
    "items",
    "id",
    columns,
    [null, { qty: 1 }, { id: true, qty: 1 }, { id: "a", qty: 1, amount: 120.4 }, { id: "a", qty: 2 }, { id: "b", qty: "oops", amount: 10.4 }],
    { baseLine: 100, blockLang: "data", file: "doc.calc.md" }
  );

  assert.equal(res.rows.length, 2);
  assert.deepEqual(toPlainRows(res.rows), [
    { id: "a", qty: 1, amount: 120 },
    { id: "b", qty: "oops", amount: 10 },
  ]);

  const found = new Set(codes(res.messages));
  assert.ok(found.has("CD_DATA_ROW_NOT_OBJECT"));
  assert.ok(found.has("CD_DATA_ROW_MISSING_PK"));
  assert.ok(found.has("CD_DATA_PK_TYPE"));
  assert.ok(found.has("CD_DATA_PK_DUPLICATE"));
  assert.ok(found.has("CD_DATA_INVALID_VALUE"));
  assert.ok(res.messages.some((m) => m.file === "doc.calc.md"));
});

test("data_rows: parseInlineJsonlRows handles comments, JSON errors, PK errors, and row map", () => {
  const columns = {
    id: { name: "string", args: [], raw: "string" },
    n: { name: "number", args: [], raw: "number" },
  };

  const rowLines = [
    "# comment",
    "",
    "{\"id\":\"x\",\"n\":1.2}",
    "{bad",
    "[]",
    "{\"n\":1}",
    "{\"id\":true,\"n\":2}",
    "{\"id\":\"x\",\"n\":3}",
    "{\"id\":\"y\",\"n\":\"oops\"}",
  ];

  const res = parseInlineJsonlRows({
    tableName: "items",
    primaryKey: "id",
    columns,
    rowLines,
    fenceLine: 200,
    separatorLineIndex: 2,
    blockLang: "data",
  });

  assert.equal(res.rows.length, 2);
  assert.deepEqual(toPlainRows(res.rows), [
    { id: "x", n: 1.2 },
    { id: "y", n: "oops" },
  ]);
  assert.deepEqual(res.rowMap, [
    { primaryKey: "x", line: 206 },
    { primaryKey: "y", line: 212 },
  ]);

  const found = new Set(codes(res.messages));
  assert.ok(found.has("CD_DATA_ROW_INVALID_JSON"));
  assert.ok(found.has("CD_DATA_ROW_NOT_OBJECT"));
  assert.ok(found.has("CD_DATA_ROW_MISSING_PK"));
  assert.ok(found.has("CD_DATA_PK_TYPE"));
  assert.ok(found.has("CD_DATA_PK_DUPLICATE"));
  assert.ok(found.has("CD_DATA_INVALID_VALUE"));
});

test("data_parse: validates block structure and external table constraints", () => {
  const missingSep = parseDataBlock(block("name: t\nprimaryKey: id\ncolumns:\n  id: string", 5));
  assert.equal(missingSep.table, null);
  assert.ok(codes(missingSep.messages).includes("CD_DATA_MISSING_SEPARATOR"));

  const missingName = parseDataBlock(block("primaryKey: id\ncolumns:\n  id: string\n---\n{\"id\":\"a\"}", 10));
  assert.equal(missingName.table, null);
  assert.ok(codes(missingName.messages).includes("CD_DATA_HEADER_MISSING_NAME"));

  const invalidName = parseDataBlock(block("name: 123bad\nprimaryKey: id\ncolumns:\n  id: string\n---\n{\"id\":\"a\"}", 11));
  assert.equal(invalidName.table, null);
  assert.ok(codes(invalidName.messages).includes("CD_DATA_INVALID_NAME"));

  const missingPrimaryKey = parseDataBlock(block("name: t\ncolumns:\n  id: string\n---\n{\"id\":\"a\"}", 12));
  assert.equal(missingPrimaryKey.table, null);
  assert.ok(codes(missingPrimaryKey.messages).includes("CD_DATA_HEADER_MISSING_PRIMARY_KEY"));

  const missingColumns = parseDataBlock(block("name: t\nprimaryKey: id\n---\n{\"id\":\"a\"}", 13));
  assert.equal(missingColumns.table, null);
  assert.ok(codes(missingColumns.messages).includes("CD_DATA_HEADER_MISSING_COLUMNS"));

  const pkNotDeclared = parseDataBlock(block("name: t\nprimaryKey: id\ncolumns:\n  other: string\n---\n{\"other\":\"a\"}", 14));
  assert.ok(pkNotDeclared.table);
  assert.ok(codes(pkNotDeclared.messages).includes("CD_DATA_PRIMARYKEY_NOT_DECLARED"));

  const badMeta = parseDataBlock(
    block("name: std\nprimaryKey: id\nsortBy: bad-key\ncolumns:\n  id: string\n---\n{\"id\":\"a\"}", 20)
  );
  assert.equal(badMeta.table, null);
  const badMetaCodes = new Set(codes(badMeta.messages));
  assert.ok(badMetaCodes.has("CD_DATA_RESERVED_NAME"));
  assert.ok(badMetaCodes.has("CD_DATA_SORTBY_INVALID"));

  const inlineWithUnusedExternalKeys = parseDataBlock(
    block(
      "name: items\nprimaryKey: id\nformat: csv\nhash: sha256:1111111111111111111111111111111111111111111111111111111111111111\ncolumns:\n  id: string\n---\n{\"id\":\"a\"}",
      40
    )
  );
  assert.ok(inlineWithUnusedExternalKeys.table);
  assert.deepEqual(toPlainRows(inlineWithUnusedExternalKeys.table.rows), [{ id: "a" }]);
  const inlineCodes = new Set(codes(inlineWithUnusedExternalKeys.messages));
  assert.ok(inlineCodes.has("CD_DATA_UNUSED_FORMAT"));
  assert.ok(inlineCodes.has("CD_DATA_UNUSED_HASH"));

  const externalBad = parseDataBlock(
    block(
      "name: ext\nprimaryKey: id\nsource: ./rows.data\nformat: xml\nhash: nope\ncolumns:\n  id: string\n---\n{\"id\":\"a\"}",
      60
    )
  );
  assert.ok(externalBad.table);
  const externalBadCodes = new Set(codes(externalBad.messages));
  assert.ok(externalBadCodes.has("CD_DATA_EXTERNAL_FORMAT"));
  assert.ok(externalBadCodes.has("CD_DATA_EXTERNAL_INVALID_HASH"));
  assert.ok(externalBadCodes.has("CD_DATA_EXTERNAL_INLINE_ROWS"));
  assert.equal(Object.prototype.hasOwnProperty.call(externalBad.table, "source"), false);

  const externalOk = parseDataBlock(
    block(
      "name: ext_ok\nprimaryKey: id\nsource: ./rows.csv\nhash: sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\nsortBy: missing_col\ncolumns:\n  id: string\n---\n# no inline rows",
      80
    )
  );
  assert.ok(externalOk.table);
  assert.deepEqual(externalOk.table.source, {
    uri: "./rows.csv",
    format: "csv",
    hash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  });
  assert.deepEqual(externalOk.table.rows, []);
  assert.equal(Object.prototype.hasOwnProperty.call(externalOk.table, "rowMap"), false);
  assert.ok(codes(externalOk.messages).includes("CD_DATA_SORTBY_UNKNOWN"));
});

test("csv parser handles quotes, escaped quotes, and blank lines", () => {
  const parsed = parseCsv('a,b\n"1,2",3\n"say ""hi""",4\n\n');
  assert.deepEqual(parsed.header, ["a", "b"]);
  assert.deepEqual(parsed.rows, [
    ["1,2", "3"],
    ['say "hi"', "4"],
  ]);

  assert.deepEqual(parseCsv(""), { header: [], rows: [] });
});
