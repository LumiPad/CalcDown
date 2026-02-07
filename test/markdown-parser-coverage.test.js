import assert from "node:assert/strict";
import { test } from "node:test";

import {
  extractFencedCodeBlocks,
  extractFrontMatter,
  hasCalcdownFenceMarkers,
  isCalcdownFenceMarkerInfo,
  parseCalcdownMarkdown,
} from "../dist/markdown.js";

test("markdown parser: fence marker detection supports explicit calcdown forms", () => {
  assert.equal(isCalcdownFenceMarkerInfo("calcdown"), true);
  assert.equal(isCalcdownFenceMarkerInfo("calcdown view"), true);
  assert.equal(isCalcdownFenceMarkerInfo("calcdown:view"), true);
  assert.equal(isCalcdownFenceMarkerInfo("view"), false);
  assert.equal(isCalcdownFenceMarkerInfo(""), false);
});

test("markdown parser: front matter extraction handles missing/unterminated blocks", () => {
  const noFm = extractFrontMatter("# Title\n");
  assert.equal(noFm.frontMatter, null);
  assert.equal(noFm.bodyStartLine, 1);

  const unterminated = extractFrontMatter("---\ncalcdown: 1.0\n# no end");
  assert.equal(unterminated.frontMatter, null);
  assert.equal(unterminated.bodyStartLine, 1);

  const withFm = extractFrontMatter("---\ncalcdown: 1.0\nentry: docs/x.calc.md\n---\nBody\n");
  assert.ok(withFm.frontMatter);
  assert.equal(withFm.frontMatter.data.calcdown, "1.0");
  assert.equal(withFm.frontMatter.data.entry, "docs/x.calc.md");
  assert.equal(withFm.bodyStartLine, 5);
  assert.match(withFm.body, /^Body/);
});

test("markdown parser: fenced blocks extraction handles backtick/tilde fences and close-fence rules", () => {
  const body = [
    "```inputs",
    "x : number = 1",
    "```   ",
    "",
    "~~~calcdown:view",
    "{ \"id\": \"v\" }",
    "~~~",
    "",
    "```data",
    "name: t",
    "---",
    "{\"id\":\"a\"}",
    "`` not-a-fence",
    "```",
  ].join("\n");

  const blocks = extractFencedCodeBlocks(body, 20);
  assert.equal(blocks.length, 3);
  assert.equal(blocks[0].lang, "inputs");
  assert.equal(blocks[0].fenceLine, 20);
  assert.equal(blocks[0].closeFenceLine, 22);
  assert.equal(blocks[1].lang, "view");
  assert.equal(blocks[2].lang, "data");
});

test("markdown parser: parseCalcdownMarkdown and marker search integrate correctly", () => {
  const markdown = [
    "---",
    "calcdown: 1.0",
    "---",
    "",
    "```javascript",
    "console.log('hi')",
    "```",
    "",
    "``` calcdown calc",
    "const x = 1;",
    "```",
    "",
    "```calcdown:unknown",
    "text",
    "```",
  ].join("\n");

  const parsed = parseCalcdownMarkdown(markdown);
  assert.ok(parsed.frontMatter);
  assert.equal(parsed.codeBlocks.length, 3);
  assert.equal(parsed.codeBlocks[0].lang, "javascript");
  assert.equal(parsed.codeBlocks[1].lang, "calc");
  assert.equal(parsed.codeBlocks[2].lang, "calcdown");
  assert.equal(hasCalcdownFenceMarkers(markdown), true);
});
