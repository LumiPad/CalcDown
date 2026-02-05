import assert from "node:assert/strict";
import { test } from "node:test";

import { stripNarrativeComments } from "../dist/web/markdown_render.js";

test("narrative %% comment lines are removed", () => {
  const src = ["- a", "%% hidden", "- b", ""].join("\n");
  const out = stripNarrativeComments(src);
  assert.equal(out, ["- a", "- b", ""].join("\n"));
});

test("narrative HTML comment-only lines are removed (single line)", () => {
  const src = ["- a", "<!-- hidden -->", "- b", ""].join("\n");
  const out = stripNarrativeComments(src);
  assert.equal(out, ["- a", "- b", ""].join("\n"));
});

test("narrative HTML comment blocks are removed (multi-line)", () => {
  const src = ["- a", "<!--", "hidden", "-->", "- b", ""].join("\n");
  const out = stripNarrativeComments(src);
  assert.equal(out, ["- a", "- b", ""].join("\n"));
});

test("narrative HTML comments are removed inline without affecting surrounding text", () => {
  const src = "Hello <!-- hidden --> world";
  const out = stripNarrativeComments(src);
  assert.equal(out, "Hello  world");
});

test("HTML comments inside inline code spans are preserved", () => {
  const src = "Show `<!-- not-a-comment -->` literally.";
  const out = stripNarrativeComments(src);
  assert.equal(out, src);
});

test("escaped HTML comment openers are preserved", () => {
  const src = String.raw`Show \<!-- not-a-comment --> literally.`;
  const out = stripNarrativeComments(src);
  assert.equal(out, src);
});

