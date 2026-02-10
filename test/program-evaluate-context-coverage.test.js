import assert from "node:assert/strict";
import { test } from "node:test";

import { compileCalcScript } from "../dist/calcscript/compile.js";
import { evaluateProgram } from "../dist/program_evaluate.js";

function programFromScript(source) {
  const compiled = compileCalcScript(source, 1);
  assert.deepEqual(compiled.messages, []);
  return {
    inputs: [],
    tables: [],
    nodes: compiled.nodes,
    blocks: [],
  };
}

function codes(messages) {
  return messages.map((m) => m.code);
}

test("program_evaluate: reports invalid currentDateTime override and falls back", () => {
  const program = programFromScript("const x = 1;");
  const res = evaluateProgram(program, {}, { currentDateTime: "nope" });
  assert.equal(res.values.x, 1);
  assert.ok(codes(res.messages).includes("CD_CONTEXT_INVALID_DATETIME"));
});

test("program_evaluate: accepts currentDateTime override for std.date.today()", () => {
  const program = programFromScript("const today = std.date.format(std.date.today(), \"%Y-%m-%d\");");
  const res = evaluateProgram(program, {}, { currentDateTime: new Date("2024-01-02T03:04:05Z") });
  assert.equal(res.values.today, "2024-01-02");
  assert.equal(codes(res.messages).includes("CD_CONTEXT_INVALID_DATETIME"), false);
});

