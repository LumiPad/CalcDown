import assert from "node:assert/strict";
import { test } from "node:test";

import { parseProgram } from "../dist/index.js";
import { validateViewsFromBlocks } from "../dist/view_contract.js";

test("non-CalcDown fenced code blocks are allowed (missing lang)", () => {
  const markdown = "---\ncalcdown: 1.0\n---\n\n```\nhello\n```\n";
  const res = parseProgram(markdown);
  assert.equal(res.messages.filter((m) => m.severity === "error").length, 0);
});

test("non-CalcDown fenced code blocks are allowed (unknown lang)", () => {
  const markdown = "---\ncalcdown: 1.0\n---\n\n```js\nconsole.log(1)\n```\n";
  const res = parseProgram(markdown);
  assert.equal(res.messages.filter((m) => m.severity === "error").length, 0);
});

test("explicit calcdown marker requires a kind (missing)", () => {
  const markdown = "---\ncalcdown: 1.0\n---\n\n```calcdown\nx\n```\n";
  const res = parseProgram(markdown);
  assert.ok(res.messages.some((m) => m.severity === "error" && m.code === "CD_BLOCK_CALCDOWN_MISSING_KIND"));
});

test("explicit calcdown marker rejects unknown kinds", () => {
  const markdown = "---\ncalcdown: 1.0\n---\n\n```calcdown foo\nx\n```\n";
  const res = parseProgram(markdown);
  assert.ok(res.messages.some((m) => m.severity === "error" && m.code === "CD_BLOCK_CALCDOWN_UNKNOWN_KIND"));
});

test("explicit calcdown marker maps to normal block kinds", () => {
  const markdown = "---\ncalcdown: 1.0\n---\n\n```calcdown inputs\nx : number = 1\n```\n";
  const res = parseProgram(markdown);
  assert.equal(res.messages.filter((m) => m.severity === "error").length, 0);
  assert.equal(res.program.inputs.length, 1);
  assert.equal(res.program.inputs[0]?.name, "x");
});

test("common near-miss fence langs emit a warning", () => {
  const markdown = "---\ncalcdown: 1.0\n---\n\n```input\nx : number = 1\n```\n";
  const res = parseProgram(markdown);
  assert.ok(res.messages.some((m) => m.severity === "warning" && m.code === "CD_BLOCK_SUSPECT_LANG"));
});

test("explicit fence mode ignores bare CalcDown block kinds", () => {
  const markdown =
    "---\ncalcdown: 1.0\n---\n\n```inputs\nx : number = 1\n```\n\n```calc\nconst y = 2;\n```\n\n```view\n{\"id\":\"v1\",\"type\":\"cards\",\"spec\":{\"items\":[{\"key\":\"y\"}]}}\n```\n";
  const res = parseProgram(markdown, { fenceMode: "explicit" });
  assert.equal(res.messages.length, 0);
  assert.equal(res.program.inputs.length, 0);
  assert.equal(res.program.nodes.length, 0);
  const views = validateViewsFromBlocks(res.program.blocks).views;
  assert.equal(views.length, 0);
});

test("explicit fence mode parses calcdown marker blocks", () => {
  const markdown =
    "---\ncalcdown: 1.0\n---\n\n```calcdown inputs\nx : number = 1\n```\n\n```calcdown calc\nconst y = x + 1;\n```\n\n```calcdown view\n{\"id\":\"v1\",\"type\":\"cards\",\"spec\":{\"items\":[{\"key\":\"y\"}]}}\n```\n";
  const res = parseProgram(markdown, { fenceMode: "explicit" });
  assert.equal(res.messages.filter((m) => m.severity === "error").length, 0);
  assert.equal(res.program.inputs.length, 1);
  assert.equal(res.program.nodes.length, 1);
  const views = validateViewsFromBlocks(res.program.blocks).views;
  assert.equal(views.length, 1);
  assert.equal(views[0]?.id, "v1");
});
