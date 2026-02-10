import assert from "node:assert/strict";
import { test } from "node:test";

import { parseInputsBlock } from "../dist/inputs.js";

function block(content, fenceLine = 10, lang = "inputs") {
  return { kind: "code", lang, content, fenceLine };
}

function codes(messages) {
  return messages.map((m) => m.code);
}

test("inputs parser: handles core types, currency args, and custom types", () => {
  const res = parseInputsBlock(
    block(
      [
        "# comment",
        "name : string = \"Joi\"",
        "nickname : string = hello",
        "nickname2 : string = 'hi'",
        "flag : boolean = true # inline comment",
        "n : Number = 1.5",
        "i : integer = -2",
        "p : percent = 0.12",
        "rate : percent = 5.0 [min: 0, max: 100]",
        "years : integer = 30 [min: 1, max: 50]",
        "isk : currency[isk] = 154.3",
        "usd : currency(\"usd\") = 12.34",
        "d : date = 2025-03-04",
        "custom_num : Custom = 42",
        "custom_text : Custom = hello",
      ].join("\n"),
      50
    )
  );

  assert.deepEqual(res.messages, []);
  const byName = Object.fromEntries(res.inputs.map((x) => [x.name, x]));

  assert.equal(byName.name.type.name, "string");
  assert.equal(byName.name.defaultValue, "Joi");
  assert.equal(byName.nickname.defaultValue, "hello");
  assert.equal(byName.nickname2.defaultValue, "hi");

  assert.equal(byName.flag.type.name, "boolean");
  assert.equal(byName.flag.defaultValue, true);

  assert.equal(byName.n.type.name, "number");
  assert.equal(byName.n.defaultValue, 1.5);

  assert.equal(byName.i.type.name, "integer");
  assert.equal(byName.i.defaultValue, -2);

  assert.equal(byName.p.type.name, "percent");
  assert.equal(byName.p.defaultValue, 0.12);

  assert.deepEqual({ ...byName.rate.constraints }, { min: 0, max: 100 });
  assert.deepEqual({ ...byName.years.constraints }, { min: 1, max: 50 });

  assert.equal(byName.isk.type.name, "currency");
  assert.deepEqual(byName.isk.type.args, ["ISK"]);
  assert.equal(byName.isk.defaultValue, 154);

  assert.equal(byName.usd.type.name, "currency");
  assert.deepEqual(byName.usd.type.args, ["USD"]);
  assert.equal(byName.usd.defaultValue, 12.34);

  assert.ok(byName.d.defaultValue instanceof Date);
  assert.equal(byName.d.defaultValue.toISOString().slice(0, 10), "2025-03-04");

  assert.equal(byName.custom_num.type.name, "Custom");
  assert.equal(byName.custom_num.defaultValue, 42);
  assert.equal(byName.custom_text.defaultValue, "hello");
});

test("inputs parser: reports invalid lines, invalid defaults, and duplicate names", () => {
  const res = parseInputsBlock(
    block(
      [
        "not a valid line",
        "bad_bool : boolean = maybe",
        "bad_int : integer = 1.2",
        "bad_date : date = nope",
        "bad_constraints : number = 1 [min: x]",
        "empty_constraints : number = 1 []",
        "bad_constraint_part : number = 1 [nope]",
        "min_gt_max : number = 1 [min: 2, max: 1]",
        "no_minmax : number = 1 [,]",
        "string_constraints : string = \"x\" [min: 0]",
        "int_constraints_nonint : integer = 1 [min: 0.5]",
        "int_constraints_nonint_max : integer = 1 [max: 0.5]",
        "dup_constraints : number = 1 [min: 0, min: 1]",
        "tight_constraints : number = 1[min: 0]",
        "bracket_missing_open : number = 1]",
        "missing_default : number = [min: 0]",
        "x : number = 1",
        "x : number = 2",
        " # comment only",
      ].join("\n"),
      5
    )
  );

  const found = new Set(codes(res.messages));
  assert.ok(found.has("CD_INPUT_INVALID_LINE"));
  assert.ok(found.has("CD_INPUT_INVALID_DEFAULT"));
  assert.ok(found.has("CD_INPUT_INVALID_CONSTRAINTS"));
  assert.ok(found.has("CD_INPUT_DUPLICATE_NAME"));

  assert.equal(res.inputs.length, 1);
  assert.equal(res.inputs[0].name, "x");
  assert.equal(res.inputs[0].defaultValue, 1);
});
