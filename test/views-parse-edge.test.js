import assert from "node:assert/strict";
import { test } from "node:test";

import { parseViewBlock } from "../dist/views.js";

function block(content, fenceLine = 10, lang = "view") {
  return { kind: "code", lang, content, fenceLine };
}

function codes(messages) {
  return messages.map((m) => m.code);
}

test("views parser: empty and invalid blocks produce stable diagnostics", () => {
  const empty = parseViewBlock(block("   ", 5));
  assert.equal(empty.views.length, 0);
  assert.ok(codes(empty.messages).includes("CD_VIEW_EMPTY_BLOCK"));

  const invalid = parseViewBlock(block("{ not-json: [", 12));
  assert.equal(invalid.views.length, 0);
  assert.ok(codes(invalid.messages).includes("CD_VIEW_PARSE"));
  assert.ok(invalid.messages[0].line >= 13);
});

test("views parser: array/object shape checks and item-level validation", () => {
  const notObject = parseViewBlock(block("123", 30));
  assert.equal(notObject.views.length, 0);
  assert.ok(codes(notObject.messages).includes("CD_VIEW_EXPECT_OBJECT_OR_ARRAY"));

  const mixedArray = parseViewBlock(block('[{"id":"ok","type":"cards","spec":{"items":[{"key":"a"}]}}, 1, null]', 40));
  assert.equal(mixedArray.views.length, 1);
  assert.ok(codes(mixedArray.messages).includes("CD_VIEW_ITEMS_OBJECT"));
});

test("views parser: enforces depth and node-count limits", () => {
  const deep = {};
  let cursor = deep;
  for (let i = 0; i < 70; i++) {
    cursor.next = {};
    cursor = cursor.next;
  }
  const deepRes = parseViewBlock(block(JSON.stringify(deep), 60));
  assert.equal(deepRes.views.length, 0);
  assert.ok(codes(deepRes.messages).includes("CD_VIEW_LIMIT"));

  const large = Array.from({ length: 5002 }, () => ({}));
  const largeRes = parseViewBlock(block(JSON.stringify(large), 80));
  assert.equal(largeRes.views.length, 0);
  assert.ok(codes(largeRes.messages).includes("CD_VIEW_LIMIT"));
});
