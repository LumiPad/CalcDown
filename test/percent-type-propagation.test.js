import assert from "node:assert/strict";
import { test } from "node:test";

import { parseProgram } from "../dist/index.js";
import { inferCalcdownTypes } from "../dist/infer_types.js";

test("percent type propagates through additive ops and aggregations", () => {
  const markdown = [
    "---",
    "calcdown: 1.0",
    "---",
    "",
    "``` inputs",
    "base_rate : percent = 5.0",
    "bump_rate : percent = 1.5",
    "```",
    "",
    "``` data",
    "name: policy",
    "primaryKey: id",
    "columns:",
    "  id: string",
    "  effect: percent",
    "---",
    "{\"id\":\"a\",\"effect\":0.6}",
    "{\"id\":\"b\",\"effect\":0.8}",
    "```",
    "",
    "``` calc",
    "const total_rate = base_rate + bump_rate;",
    "const net_rate = total_rate - bump_rate;",
    "const policy_effect_sum = std.math.sum(policy.effect);",
    "const policy_effect_table_sum = std.table.sum(policy, \"effect\");",
    "```",
    "",
  ].join("\n");

  const parsed = parseProgram(markdown);
  assert.equal(parsed.messages.filter((m) => m.severity === "error").length, 0);

  const inferred = inferCalcdownTypes(parsed.program);

  assert.equal(inferred.valueTypes.total_rate?.name, "percent");
  assert.equal(inferred.valueTypes.net_rate?.name, "percent");
  assert.equal(inferred.valueTypes.policy_effect_sum?.name, "percent");
  assert.equal(inferred.valueTypes.policy_effect_table_sum?.name, "percent");
});

