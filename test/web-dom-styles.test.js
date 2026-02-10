import assert from "node:assert/strict";
import { test } from "node:test";

import { createDebouncer } from "../dist/web/debounce.js";
import { byId, clear } from "../dist/web/dom.js";
import { CALCDOWN_BASE_CSS, installCalcdownStyles } from "../dist/web/styles.js";

import { FakeDocument, FakeElement, createFakeWindow, nodesByTag, withFakeDom } from "./fake_dom.js";

test("web debounce: schedule/cancel are deterministic without real timers", () => {
  const { window, runAllTimers, timerCount } = createFakeWindow();

  withFakeDom(
    () => {
      const calls = [];
      const d = createDebouncer(5);
      d.schedule(() => calls.push("a"));
      d.schedule(() => calls.push("b"));
      assert.equal(timerCount(), 1);
      runAllTimers();
      assert.deepEqual(calls, ["b"]);

      d.schedule(() => calls.push("c"));
      assert.equal(timerCount(), 1);
      d.cancel();
      assert.equal(timerCount(), 0);
      runAllTimers();
      assert.deepEqual(calls, ["b"]);

      // Non-finite ms falls back to 0 delay (still schedules deterministically).
      const d2 = createDebouncer(Number.NaN);
      d2.schedule(() => calls.push("d"));
      runAllTimers();
      assert.deepEqual(calls, ["b", "d"]);
    },
    { document: new FakeDocument(), window }
  );
});

test("web dom: clear removes children and byId enforces ctor", () =>
  withFakeDom(
    () => {
      const root = document.createElement("div");
      root.appendChild(document.createElement("span"));
      root.appendChild(document.createElement("span"));
      assert.equal(root.children.length, 2);
      clear(root);
      assert.equal(root.children.length, 0);

      const el = document.createElement("div");
      el.id = "root";
      document.documentElement.appendChild(el);

      assert.equal(byId("root", FakeElement, "root element"), el);
      assert.throws(() => byId("missing", FakeElement, "missing element"), /Missing missing element/);
      assert.throws(() => byId("root", class NotFake {}, "wrong ctor"), /Missing wrong ctor/);
    },
    { document: new FakeDocument() }
  ));

test("web styles: installCalcdownStyles adds a single style tag (head/documentElement)", () => {
  const doc = new FakeDocument();
  installCalcdownStyles(doc);

  const styles = nodesByTag(doc.documentElement, "style");
  assert.equal(styles.length, 1);
  assert.equal(styles[0].id, "calcdown-styles");
  assert.equal(styles[0].textContent, CALCDOWN_BASE_CSS);

  // Idempotent: second call is a no-op.
  installCalcdownStyles(doc);
  assert.equal(nodesByTag(doc.documentElement, "style").length, 1);

  // Falls back to documentElement when head is absent.
  const noHead = new FakeDocument({ withHead: false });
  installCalcdownStyles(noHead);
  const styles2 = nodesByTag(noHead.documentElement, "style");
  assert.equal(styles2.length, 1);
  assert.equal(styles2[0].id, "calcdown-styles");
});

