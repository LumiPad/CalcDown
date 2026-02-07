import assert from "node:assert/strict";
import { test } from "node:test";

import { compileCalcScript } from "../dist/calcscript/compile.js";
import { parseExpression } from "../dist/calcscript/parser.js";
import { inferCalcdownTypes } from "../dist/infer_types.js";

function type(name, args = []) {
  return { name, args, raw: args.length ? `${name}(${args.join(",")})` : name };
}

function input(name, t, value) {
  return { name, type: t, defaultText: String(value), defaultValue: value, line: 1 };
}

test("infer types: covers numeric/currency/percent propagation and table inference", () => {
  const script = [
    "const cur_add = usd + n;",
    "const cur_same = usd + usd;",
    "const cur_mixed = usd + eur;",
    "const num_add = n + i;",
    "const num_mul = n * i;",
    "const pow_num = n ** i;",
    "const pct_add = pct + pct;",
    "const cur_mul_pct = usd * pct;",
    "const pct_div_num = pct / n;",
    "const num_div_cur = n / usd;",
    "const bool_logic = true && false;",
    "const cmp = n >= i;",
    "const neg_vec = -sales.qty;",
    "const not_flag = !flag;",
    "const str_cat = s & n;",
    "const member_from_obj = ({x:1}).x;",
    "const lit_str = \"x\";",
    "const lit_bool = true;",
    "const table_col = std.table.col(sales, \"qty\");",
    "const table_col_not_table = std.table.col(n, \"qty\");",
    "const table_col_non_string_key = std.table.col(sales, n);",
    "const table_col_missing = std.table.col(sales, \"missing\");",
    "const table_sum_cur = std.table.sum(sales, \"rev\");",
    "const table_sum_pct = std.table.sum(sales, \"margin\");",
    "const table_sum_num = std.table.sum(sales, \"qty\");",
    "const table_sum_non_numeric = std.table.sum(sales, \"id\");",
    "const table_sum_missing = std.table.sum(sales, \"missing\");",
    "const map_scalar = std.table.map(sales, (row, idx) => idx);",
    "const map_no_params = std.table.map(sales, () => 1);",
    "const map_table = std.table.map(sales, (row) => ({ id: row.id, rev: row.rev }));",
    "const map_table_bad_obj = std.table.map(sales, (row) => ({ id: row.id, nested: { x: 1 } }));",
    "const map_unknown = std.table.map(sales, (row) => row.missing);",
    "const map_not_table = std.table.map(n, (x) => x);",
    "const map_non_arrow = std.table.map(sales, n);",
    "const std_math_sum_cur = std.math.sum(sales.rev);",
    "const std_math_sum_pct = std.math.sum(sales.margin);",
    "const std_math_sum_num = std.math.sum(sales.qty);",
    "const std_math_sum_scalar = std.math.sum(n);",
    "const std_math_unknown = std.math.sqrt(n);",
    "const std_table_unknown = std.table.sqrt(sales);",
    "const non_std_call = foo(n);",
    "const cond_same = true ? pct : pct;",
    "const cond_same_vector = true ? sales.qty : sales.qty;",
    "const cond_diff = true ? pct : n;",
    "const cond_table = true ? std.table.map(sales, (row) => ({ id: row.id, rev: row.rev })) : std.table.map(sales, (row) => ({ id: row.id, rev: row.rev }));",
    "const cond_table_mismatch = true ? std.table.map(sales, (row) => ({ id: row.id, rev: row.rev })) : std.table.map(sales, (row) => ({ id: row.id, qty: row.qty }));",
    "const bad_numeric = s + s;",
    "const bad_numeric_unknown = missing_left + n;",
    "const member_unknown_from_scalar = n.foo;",
    "const unknown_ref = missing_id;",
    "const arrow_value = (x) => x;",
  ].join("\n");

  const compiled = compileCalcScript(script, 1);
  assert.deepEqual(compiled.messages, []);

  const inferred = inferCalcdownTypes({
    inputs: [
      input("usd", type("currency", ["USD"]), 1),
      input("eur", type("currency", ["EUR"]), 1),
      input("pct", type("percent"), 0.1),
      input("n", type("number"), 2),
      input("i", type("integer"), 3),
      input("flag", type("boolean"), true),
      input("s", type("string"), "x"),
    ],
    tables: [
      {
        name: "sales",
        primaryKey: "id",
        columns: {
          id: type("string"),
          qty: type("integer"),
          rev: type("currency", ["USD"]),
          margin: type("percent"),
        },
        rows: [],
        line: 1,
      },
    ],
    nodes: [...compiled.nodes, { name: "hole", exprText: "", dependencies: [], line: 999 }],
  });

  const vt = inferred.valueTypes;

  assert.equal(vt.cur_add.name, "currency");
  assert.deepEqual(vt.cur_add.args, ["USD"]);
  assert.equal(vt.cur_same.name, "currency");
  assert.deepEqual(vt.cur_same.args, ["USD"]);

  assert.equal(vt.cur_mixed.name, "currency");
  assert.deepEqual(vt.cur_mixed.args, []);
  assert.equal(vt.num_add.name, "number");
  assert.equal(vt.num_mul.name, "number");
  assert.equal(vt.pow_num.name, "number");

  assert.equal(vt.pct_add.name, "percent");
  assert.equal(vt.cur_mul_pct.name, "currency");
  assert.deepEqual(vt.cur_mul_pct.args, ["USD"]);
  assert.equal(vt.pct_div_num.name, "percent");
  assert.equal(vt.num_div_cur.name, "number");

  assert.equal(vt.bool_logic.name, "boolean");
  assert.equal(vt.cmp.name, "boolean");
  assert.equal(vt.not_flag.name, "boolean");
  assert.equal(vt.str_cat.name, "string");
  assert.equal(vt.member_from_obj.name, "number");
  assert.equal(vt.lit_str.name, "string");
  assert.equal(vt.lit_bool.name, "boolean");

  assert.equal(vt.table_sum_cur.name, "currency");
  assert.deepEqual(vt.table_sum_cur.args, ["USD"]);
  assert.equal(vt.table_sum_pct.name, "percent");
  assert.equal(vt.table_sum_num.name, "number");
  assert.equal(vt.table_sum_non_numeric.name, "number");
  assert.equal(vt.table_sum_missing.name, "number");

  assert.equal(vt.std_math_sum_cur.name, "currency");
  assert.deepEqual(vt.std_math_sum_cur.args, ["USD"]);
  assert.equal(vt.std_math_sum_pct.name, "percent");
  assert.equal(vt.std_math_sum_num.name, "number");
  assert.equal(vt.std_math_sum_scalar.name, "number");

  assert.equal(vt.cond_same.name, "percent");
  assert.equal(Object.prototype.hasOwnProperty.call(vt, "cond_diff"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(vt, "cond_same_vector"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(vt, "cond_table_mismatch"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(vt, "non_std_call"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(vt, "map_scalar"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(vt, "map_no_params"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(vt, "map_non_arrow"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(vt, "map_not_table"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(vt, "map_table_bad_obj"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(vt, "map_unknown"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(vt, "std_math_unknown"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(vt, "std_table_unknown"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(vt, "table_col_not_table"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(vt, "table_col_non_string_key"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(vt, "table_col_missing"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(vt, "bad_numeric"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(vt, "bad_numeric_unknown"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(vt, "member_unknown_from_scalar"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(vt, "arrow_value"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(vt, "hole"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(vt, "unknown_ref"), false);

  const ct = inferred.computedTables;
  assert.ok(ct.map_table);
  assert.equal(ct.map_table.primaryKey, "id");
  assert.equal(ct.map_table.columns.id.name, "string");
  assert.equal(ct.map_table.columns.rev.name, "currency");
  assert.deepEqual(ct.map_table.columns.rev.args, ["USD"]);
  assert.ok(ct.cond_table);
});

test("infer types: handles cyclic dependency graphs via declared-order fallback", () => {
  const inferred = inferCalcdownTypes({
    inputs: [],
    tables: [],
    nodes: [
      { name: "a", exprText: "b + 1", expr: parseExpression("b + 1"), dependencies: ["b"], line: 1 },
      { name: "b", exprText: "a + 1", expr: parseExpression("a + 1"), dependencies: ["a"], line: 2 },
    ],
  });

  assert.deepEqual({ ...inferred.valueTypes }, {});
  assert.deepEqual({ ...inferred.computedTables }, {});
});

test("infer types: tolerates unsupported expression node kinds", () => {
  const inferred = inferCalcdownTypes({
    inputs: [input("x", type("number"), 1)],
    tables: [],
    nodes: [
      {
        name: "unsupported_binary",
        exprText: "x % 2",
        expr: {
          kind: "binary",
          op: "%",
          left: { kind: "identifier", name: "x" },
          right: { kind: "number", value: 2 },
        },
        dependencies: ["x"],
        line: 1,
      },
      {
        name: "unknown_expr_kind",
        exprText: "mystery",
        expr: { kind: "mystery" },
        dependencies: [],
        line: 2,
      },
    ],
  });

  assert.equal(Object.prototype.hasOwnProperty.call(inferred.valueTypes, "unsupported_binary"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(inferred.valueTypes, "unknown_expr_kind"), false);
});
