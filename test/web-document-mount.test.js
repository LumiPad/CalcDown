import assert from "node:assert/strict";
import { test } from "node:test";

import { mountCalcdown, mountCalcdownDocument } from "../dist/web/mount.js";
import { renderCalcdownDocument, updateCalcdownDocumentViews } from "../dist/web/render_document.js";
import { runCalcdown } from "../dist/web/run.js";
import * as web from "../dist/web/index.js";

import { FakeDocument, nodesByTag, withFakeDom, walk } from "./fake_dom.js";

test("web index: re-exports a stable surface", () => {
  assert.equal(typeof web.renderCalcdownViews, "function");
  assert.equal(typeof web.mountCalcdown, "function");
  assert.equal(typeof web.installCalcdownStyles, "function");
});

test("web render_document: view slots compute render ids with/without layout", () =>
  withFakeDom(
    () => {
      const markdown = [
        "# Doc",
        "",
        "```inputs",
        "x : integer = 1",
        "```",
        "",
        "<!-- comment-only part should render nothing -->",
        "",
        "```data",
        "name: items",
        "primaryKey: id",
        "columns:",
        "  id: string",
        "  qty: integer",
        "---",
        "{\"id\":\"a\",\"qty\":1}",
        "```",
        "",
        "```calc",
        "const total = 1;",
        "```",
        "",
        "```view",
        "[",
        "  {\"id\":\"layout\",\"library\":\"calcdown\",\"type\":\"layout\",\"spec\":{\"title\":\"Layout\",\"direction\":\"row\",\"items\":[{\"direction\":\"column\",\"items\":[{\"ref\":\"summary\"}]}]}}",
        " ,{\"id\":\"summary\",\"library\":\"calcdown\",\"type\":\"cards\",\"spec\":{\"title\":\"Summary\",\"items\":[{\"key\":\"total\"}]}}",
        "]",
        "```",
        "",
        "```view",
        "{\"id\":\"summary\",\"library\":\"calcdown\",\"type\":\"cards\",\"spec\":{\"title\":\"Summary\",\"items\":[{\"key\":\"total\"}]}}",
        "```",
        "",
        "```view",
        "[{\"library\":\"calcdown\",\"type\":\"cards\",\"spec\":{\"title\":\"NoId\",\"items\":[]}}]",
        "```",
        "",
        "```fence",
        "literal",
        "```",
        "",
        "tail text",
      ].join("\n");

      const run = runCalcdown(markdown);
      const container = document.createElement("div");

      const state = renderCalcdownDocument({
        container,
        markdown,
        run,
        showSourceBlocks: true,
      });

      assert.equal(state.viewSlots.length, 3);
      assert.deepEqual(state.viewSlots[0].renderIds, ["layout"]);
      assert.deepEqual(state.viewSlots[1].renderIds, []);
      assert.deepEqual(state.viewSlots[2].renderIds, []);

      // showSourceBlocks renders code blocks for data/calc plus unknown fences.
      assert.ok(container.textContent.includes("literal"));
      assert.ok(container.textContent.includes("const total"));

      // update views is a no-op for empty renderIds and returns combined messages.
      const updated = updateCalcdownDocumentViews(state, run, {});
      assert.ok(Array.isArray(updated.messages));
      assert.ok(updated.messages.length >= 0);
    },
    { document: new FakeDocument() }
  ));

test("web render_document: code block titles and hasLayout-without-layoutId renderIds edge case", () =>
  withFakeDom(
    () => {
      const markdown = [
        "# Doc",
        "",
        // Unknown fence with no lang should render as a code block titled "code".
        "```",
        "plain",
        "```",
        "",
        // Layout references "card", so later view blocks that reference card should be filtered out.
        "```view",
        "[",
        "  {\"id\":\"layout\",\"library\":\"calcdown\",\"type\":\"layout\",\"spec\":{\"title\":\"Layout\",\"direction\":\"row\",\"items\":[{\"kind\":\"ref\",\"ref\":\"card\"}]}}",
        " ,{\"id\":\"card\",\"library\":\"calcdown\",\"type\":\"cards\",\"spec\":{\"title\":\"Card\",\"items\":[]}}",
        "]",
        "```",
        "",
        // hasLayout=true (layout present) but layoutIds=[] (layout view has no id) should still filter non-layout ids.
        "```view",
        "[",
        "  {\"library\":\" \",\"type\":\"layout\",\"spec\":{\"title\":\"NoIdLayout\",\"direction\":\"row\",\"items\":[{\"kind\":\"ref\",\"ref\":\"card\"}]}}",
        " ,{\"id\":\"card\",\"library\":\"calcdown\",\"type\":\"cards\",\"spec\":{\"title\":\"Card\",\"items\":[]}}",
        "]",
        "```",
      ].join("\n");

      const run = runCalcdown(markdown);
      const container = document.createElement("div");
      const state = renderCalcdownDocument({ container, markdown, run });

      assert.equal(state.viewSlots.length, 2);
      assert.deepEqual(state.viewSlots[0].renderIds, ["layout"]);
      assert.deepEqual(state.viewSlots[1].renderIds, []);

      const titles = nodesByTag(container, "div")
        .filter((el) => el.className === "calcdown-code-title")
        .map((el) => el.textContent);
      assert.ok(titles.includes("code"));
    },
    { document: new FakeDocument() }
  ));

test("web run + mount: mounts calcdown roots, toggles messages, and destroys deterministically", () =>
  withFakeDom(
    () => {
      const markdown = [
        "```calc",
        "const x = 1;",
        "```",
        "",
        "```view",
        "[",
        "  {\"id\":\"v\",\"library\":\"calcdown\",\"type\":\"cards\",\"spec\":{\"title\":\"V\",\"items\":[{\"key\":\"x\"}]}}",
        " ,{\"id\":\"bad\",\"library\":\"calcdown\",\"type\":\"chart\",\"source\":\"missing\",\"spec\":{\"title\":\"Bad\",\"kind\":\"line\",\"x\":{\"key\":\"x\"},\"y\":{\"key\":\"x\"}}}",
        "]",
        "```",
      ].join("\n");

      const container = document.createElement("div");
      const handle = mountCalcdown(container, markdown, { showMessages: false });

      assert.equal(nodesByTag(container, "div").some((n) => n.className === "calcdown-root"), true);
      assert.equal(nodesByTag(container, "pre").length, 0);

      handle.update(markdown, { showMessages: true });
      assert.equal(nodesByTag(container, "pre").length, 1);
      assert.ok(nodesByTag(container, "pre")[0].textContent.includes("CD_VIEW_UNKNOWN_SOURCE"));

      // Repeat true branch when messages element is already connected.
      handle.update(markdown, { showMessages: true });
      assert.equal(nodesByTag(container, "pre").length, 1);

      handle.update(markdown, { showMessages: false });
      assert.equal(nodesByTag(container, "pre").length, 0);

      // Repeat false branch when messages element is already disconnected.
      handle.update(markdown, { showMessages: false });
      assert.equal(nodesByTag(container, "pre").length, 0);

      // Cover updateOpts undefined (mountCalcdown).
      handle.update(markdown);

      // Exercise optional update paths.
      handle.update(markdown, { overrides: { x: 1 }, context: { demo: true }, chartMode: "bar", onEditTableCell: () => {} });

      const msgs = handle.lastMessages();
      assert.ok(msgs.some((m) => m.code === "CD_VIEW_UNKNOWN_SOURCE"));

      // Destroy removes connected messages element too.
      handle.update(markdown, { showMessages: true });
      handle.destroy();
      assert.equal(walk(container).some((n) => n && n.className === "calcdown-root"), false);

      // Destroy when messages element is disconnected.
      const handle2 = mountCalcdown(container, markdown, { showMessages: false });
      handle2.destroy();
    },
    { document: new FakeDocument() }
  ));

test("web mountCalcdownDocument: update overrides rebuilds cleanly", () =>
  withFakeDom(
    () => {
      const markdown = [
        "# Doc",
        "",
        "```inputs",
        "x : integer = 1",
        "```",
        "",
        "```calc",
        "const y = x + 1;",
        "```",
        "",
        "```view",
        "{\"id\":\"v\",\"library\":\"calcdown\",\"type\":\"cards\",\"spec\":{\"title\":\"V\",\"items\":[{\"key\":\"y\"}]}}",
        "```",
      ].join("\n");

      const container = document.createElement("div");
      const handle = mountCalcdownDocument(container, markdown, { showMessages: true, showSourceBlocks: true, overrides: { x: 2 } });
      assert.ok(container.textContent.includes("3"));
      const messagePres = () => nodesByTag(container, "pre").filter((p) => p.className === "calcdown-messages");
      assert.equal(messagePres().length, 1);

      // Rebuild path when overrides is present on updateOpts.
      handle.update(markdown, { overrides: { x: 3 }, showMessages: false });
      assert.equal(messagePres().length, 0);

      // Repeat false branch when messages element is already disconnected.
      handle.update(markdown, { showMessages: false });
      assert.equal(messagePres().length, 0);

      handle.update(markdown, { showMessages: true });
      assert.equal(messagePres().length, 1);

      // Repeat true branch when messages element is already connected.
      handle.update(markdown, { showMessages: true });
      assert.equal(messagePres().length, 1);

      const input = nodesByTag(container, "input").find((el) => el.type === "number");
      assert.ok(input);
      input.value = "4.9";
      input.dispatchFakeEvent("input");
      assert.ok(container.textContent.includes("5"));

      assert.ok(Array.isArray(handle.lastMessages()));

      handle.destroy();
      assert.equal(walk(container).some((n) => n && n.className === "calcdown-root"), false);

      const container2 = document.createElement("div");
      const handle2 = mountCalcdownDocument(container2, markdown, { showMessages: false });
      handle2.destroy();
    },
    { document: new FakeDocument() }
  ));

test("web mount: computed table schemas are included for views and documents", () =>
  withFakeDom(
    () => {
      const markdown = [
        "```data",
        "name: items",
        "primaryKey: id",
        "columns:",
        "  id: string",
        "  qty: integer",
        "---",
        "{\"id\":\"a\",\"qty\":1}",
        "```",
        "",
        "```calc",
        "const projected = std.table.map(items, (row) => ({ id: row.id, qty2: row.qty + 1 }));",
        "```",
        "",
        "```view",
        "[",
        "  {\"id\":\"table\",\"library\":\"calcdown\",\"type\":\"table\",\"source\":\"projected\",\"spec\":{\"title\":\"Projected\"}}",
        "]",
        "```",
      ].join("\n");

      const container = document.createElement("div");
      const handle = mountCalcdown(container, markdown);
      assert.ok(container.textContent.includes("Projected"));
      handle.destroy();

      const container2 = document.createElement("div");
      const handle2 = mountCalcdownDocument(container2, markdown);
      assert.ok(container2.textContent.includes("Projected"));
      handle2.destroy();
    },
    { document: new FakeDocument() }
  ));

test("web mountCalcdownDocument: context/chartMode/onEditTableCell branches and safe recompute after destroy", () =>
  withFakeDom(
    () => {
      const markdown = [
        "# Doc",
        "",
        "```inputs",
        "x : integer = 1",
        "```",
        "",
        "```data",
        "name: items",
        "primaryKey: id",
        "columns:",
        "  id: string",
        "  qty: integer",
        "---",
        "{\"id\":\"a\",\"qty\":1}",
        "```",
        "",
        "```data",
        "name: series",
        "primaryKey: id",
        "columns:",
        "  id: string",
        "  month: date",
        "  revenue: number",
        "---",
        "{\"id\":\"m1\",\"month\":\"2025-01-01\",\"revenue\":10}",
        "{\"id\":\"m2\",\"month\":\"2025-02-01\",\"revenue\":-5}",
        "```",
        "",
        "```calc",
        "const z = x + 1;",
        "```",
        "",
        "```view",
        "[",
        "  {\"id\":\"t\",\"library\":\"calcdown\",\"type\":\"table\",\"source\":\"items\",\"spec\":{\"title\":\"Items\",\"editable\":true}}",
        " ,{\"id\":\"c\",\"library\":\"calcdown\",\"type\":\"chart\",\"source\":\"series\",\"spec\":{\"title\":\"Chart\",\"kind\":\"line\",\"x\":{\"key\":\"month\",\"format\":\"date\"},\"y\":{\"key\":\"revenue\"}}}",
        "]",
        "```",
      ].join("\n");

      const edits = [];
      const container = document.createElement("div");
      const handle = mountCalcdownDocument(container, markdown, {
        showMessages: false,
        context: { demo: true },
        chartMode: "bar",
        onEditTableCell: (ev) => edits.push(ev),
      });

      assert.ok(container.textContent.includes("Items"));
      assert.ok(container.textContent.includes("Chart"));

      // Trigger inputs override + view-only recompute.
      const inputX = nodesByTag(container, "input").find((el) => el.dataset && el.dataset.name === "x");
      assert.ok(inputX);
      inputX.value = "2";
      inputX.dispatchFakeEvent("input");

      // Trigger an editable table edit event.
      const tableNumber = nodesByTag(container, "input").find((el) => el.type === "number" && (!el.dataset || !el.dataset.name));
      assert.ok(tableNumber);
      tableNumber.value = "3";
      tableNumber.dispatchFakeEvent("input");
      assert.ok(edits.length >= 1);

      // Cover updateOpts undefined.
      handle.update(markdown);

      handle.destroy();

      // Calling input handlers after destroy is safe and should be a no-op.
      inputX.value = "3";
      inputX.dispatchFakeEvent("input");
    },
    { document: new FakeDocument() }
  ));
