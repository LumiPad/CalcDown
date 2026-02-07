import assert from "node:assert/strict";
import { test } from "node:test";

import { renderMarkdownText } from "../dist/web/markdown_render.js";

function createFakeDocument() {
  class FakeText {
    constructor(text) {
      this.nodeType = 3;
      this.value = String(text);
    }
    get textContent() {
      return this.value;
    }
    set textContent(v) {
      this.value = String(v);
    }
  }

  class FakeElement {
    constructor(tagName) {
      this.nodeType = 1;
      this.tagName = String(tagName).toLowerCase();
      this.children = [];
    }
    appendChild(node) {
      this.children.push(node);
      return node;
    }
    get textContent() {
      return this.children.map((c) => c.textContent ?? "").join("");
    }
    set textContent(v) {
      this.children = [new FakeText(v)];
    }
  }

  return {
    createElement(tagName) {
      return new FakeElement(tagName);
    },
    createTextNode(text) {
      return new FakeText(text);
    },
  };
}

function walk(node, out = []) {
  out.push(node);
  if (node && typeof node === "object" && Array.isArray(node.children)) {
    for (const c of node.children) walk(c, out);
  }
  return out;
}

function nodesByTag(root, tagName) {
  return walk(root).filter((n) => n.nodeType === 1 && n.tagName === tagName);
}

function withFakeDom(fn) {
  const prev = globalThis.document;
  globalThis.document = createFakeDocument();
  try {
    return fn();
  } finally {
    globalThis.document = prev;
  }
}

test("markdown renderer: headings, paragraphs, hr, and list blocks", () =>
  withFakeDom(() => {
    const root = document.createElement("div");
    renderMarkdownText(
      root,
      [
        "# Inflation Plan",
        "line one",
        "line two",
        "",
        "---",
        "",
        "- first",
        "- second",
        "",
        "1. alpha",
        "2. beta",
      ].join("\n")
    );

    const topTags = root.children.map((c) => c.tagName);
    assert.deepEqual(topTags, ["h1", "p", "hr", "ul", "ol"]);
    assert.equal(root.children[1].textContent, "line one line two");
    assert.equal(root.children[3].children.length, 2);
    assert.equal(root.children[4].children.length, 2);
  }));

test("markdown renderer: inline formatting and safe/disallowed links", () =>
  withFakeDom(() => {
    const root = document.createElement("div");
    renderMarkdownText(
      root,
      "A **bold** and *em* and `code` and [ok](https://example.com) and [mail](mailto:test@example.com) and [bad](javascript:alert(1))."
    );

    const strong = nodesByTag(root, "strong");
    const em = nodesByTag(root, "em");
    const links = nodesByTag(root, "a");
    const codes = nodesByTag(root, "code");
    const spans = nodesByTag(root, "span");

    assert.equal(strong.length, 1);
    assert.equal(strong[0].textContent, "bold");
    assert.equal(em.length, 1);
    assert.equal(em[0].textContent, "em");
    assert.equal(links.length, 2);

    assert.equal(links[0].href, "https://example.com");
    assert.equal(links[0].rel, "noopener noreferrer");
    assert.equal(links[0].target, "_blank");
    assert.equal(links[1].href, "mailto:test@example.com");

    assert.ok(codes.some((c) => c.textContent === "code"));
    // Inline parser currently closes href at first ')' in markdown link syntax.
    assert.ok(codes.some((c) => c.textContent.startsWith("javascript:alert(")));
    assert.ok(spans.some((s) => s.textContent === "bad"));
  }));

test("markdown renderer: comment stripping, escaping, and code spans", () =>
  withFakeDom(() => {
    const root = document.createElement("div");
    renderMarkdownText(
      root,
      [
        "visible",
        "%% remove me",
        "<!-- remove too -->",
        "`<!--keep-->`",
        "\\*literal\\*",
      ].join("\n")
    );

    const text = root.textContent;
    assert.match(text, /visible/);
    assert.match(text, /<!--keep-->/);
    assert.match(text, /\*literal\*/);
    assert.doesNotMatch(text, /remove me/);
    assert.doesNotMatch(text, /remove too/);
  }));

test("markdown renderer: allows relative hrefs and rejects dangerous schemes", () =>
  withFakeDom(() => {
    const root = document.createElement("div");
    renderMarkdownText(
      root,
      [
        "- [hash](#x)",
        "- [root](/x)",
        "- [dot](./x)",
        "- [dotdot](../x)",
        "- [tel](tel:+123)",
        "- [rel](docs/page)",
        "- [ws](java script:alert(1))",
        "- [data](data:text/plain,abc)",
      ].join("\n")
    );

    const links = nodesByTag(root, "a");
    assert.equal(links.length, 6);
    assert.deepEqual(
      links.map((l) => l.href),
      ["#x", "/x", "./x", "../x", "tel:+123", "docs/page"]
    );

    const codeTexts = nodesByTag(root, "code").map((c) => c.textContent);
    // For links like [x](scheme:fn(1)), href text is captured up to first ')'.
    assert.ok(codeTexts.some((v) => v.startsWith("java script:alert(")));
    assert.ok(codeTexts.includes("data:text/plain,abc"));
  }));
