import assert from "node:assert/strict";
import { test } from "node:test";

import { renderMarkdownText } from "../dist/web/markdown_render.js";
import { FakeDocument, nodesByTag, withFakeDom } from "./fake_dom.js";

test("markdown renderer: headings, paragraphs, hr, and list blocks", () =>
  withFakeDom(
    () => {
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
    },
    { document: new FakeDocument() }
  ));

test("markdown renderer: inline formatting and safe/disallowed links", () =>
  withFakeDom(
    () => {
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
    },
    { document: new FakeDocument() }
  ));

test("markdown renderer: comment stripping, escaping, and code spans", () =>
  withFakeDom(
    () => {
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
    },
    { document: new FakeDocument() }
  ));

test("markdown renderer: allows relative hrefs and rejects dangerous schemes", () =>
  withFakeDom(
    () => {
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
    },
    { document: new FakeDocument() }
  ));

test("markdown renderer: handles edge-case escapes and unclosed inline markers", () =>
  withFakeDom(
    () => {
    const root = document.createElement("div");
    renderMarkdownText(
      root,
      [
        "\\<!--not a comment-->",
        "\\\\<!-- stripped -->",
        "--",
        "Text with trailing backslash " + "\\",
        "Unclosed `code",
        "**bold",
        "*em",
        "[empty]()",
        "[broken](https://example.com",
      ].join("\n")
    );

    const text = root.textContent;
    assert.match(text, /<!--not a comment-->/);
    assert.doesNotMatch(text, /stripped/);
    assert.doesNotMatch(text, /\\$/);

    const links = nodesByTag(root, "a");
    assert.equal(links.length, 0);
    },
    { document: new FakeDocument() }
  ));

test("markdown renderer: extra branches (http/upper schemes, mixed bullets, multiline comments)", () =>
  withFakeDom(
    () => {
      const root = document.createElement("div");
      renderMarkdownText(
        root,
        [
          "a",
          "<!--",
          "multi",
          "line",
          "-->",
          "b",
          "",
          "* star",
          "+ plus",
          "- dash",
          "",
          "[http](http://example.com)",
          "[upper](HTTP://example.com)",
          "not a link [x] ok",
        ].join("\n")
      );

      assert.ok(root.textContent.includes("a"));
      assert.ok(root.textContent.includes("b"));
      assert.doesNotMatch(root.textContent, /multi/);

      const uls = nodesByTag(root, "ul");
      assert.equal(uls.length, 1);
      assert.equal(uls[0].children.length, 3);

      const links = nodesByTag(root, "a");
      assert.deepEqual(
        links.map((l) => l.href),
        ["http://example.com", "HTTP://example.com"]
      );
    },
    { document: new FakeDocument() }
  ));

test("markdown renderer: hr variants and multiline code/comment edge", () =>
  withFakeDom(
    () => {
      const root = document.createElement("div");
      renderMarkdownText(
        root,
        [
          "`<!--",
          "not code span -->`",
          "***",
          "___",
          "- - -",
        ].join("\n")
      );

      const hrs = nodesByTag(root, "hr");
      assert.equal(hrs.length, 2);
    },
    { document: new FakeDocument() }
  ));
