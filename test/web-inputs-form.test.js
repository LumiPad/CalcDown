import assert from "node:assert/strict";
import { test } from "node:test";

import { readInputOverrides, renderInputsForm } from "../dist/web/inputs_form.js";

import { FakeDocument, nodesByTag, withFakeDom } from "./fake_dom.js";

function type(name, args = []) {
  return { name, args, raw: args.length ? `${name}(${args.join(",")})` : name };
}

function inputDef(name, line, t, defaultValue, constraints = undefined) {
  return {
    name,
    line,
    type: t,
    defaultText: String(defaultValue),
    defaultValue,
    ...(constraints ? { constraints } : {}),
  };
}

test("web inputs form: renders controls, fires onChange, and reads overrides", () =>
  withFakeDom(
    () => {
      const root = document.createElement("div");
      root.appendChild(document.createElement("span"));

      const inputs = [
        inputDef("flag", 1, type("boolean"), false),
        inputDef("bTrue", 2, type("boolean"), false),
        inputDef("bFalse", 3, type("boolean"), true),
        inputDef("bFallback", 4, type("boolean"), false),
        inputDef("bString", 4, type("boolean"), false),
        inputDef("start", 4, type("date"), new Date("2025-01-02T00:00:00Z")),
        inputDef("rate", 4, type("percent"), 5),
        inputDef("qty", 5, type("integer"), 2, { min: 0, max: 10 }),
        inputDef("isk", 6, type("currency", ["ISK"]), 10.6),
        inputDef("usd", 6, type("currency", ["usd"]), 10.6),
        inputDef("curNoCode", 6, type("currency"), 1.2),
        inputDef("badBounds", 6, type("integer"), 1, { min: Number.NaN, max: Number.POSITIVE_INFINITY }),
        inputDef("note", 7, type("string"), "x"),
        inputDef("textWeird", 8, type("string"), "x"),
        inputDef("customNumber", 8, type("custom"), 42),
      ];

      const events = [];
      renderInputsForm({
        container: root,
        inputs,
        overrides: { note: "override", bTrue: "true", bFalse: "false", bFallback: 1, bString: "0", textWeird: false },
        onChange: (ev) => events.push(ev),
      });

      assert.equal(root.children.length, inputs.length);

      const renderedInputs = nodesByTag(root, "input");
      assert.equal(renderedInputs.length, inputs.length);

      const byName = new Map(renderedInputs.map((el) => [el.dataset.name, el]));
      const flag = byName.get("flag");
      const bTrue = byName.get("bTrue");
      const bFalse = byName.get("bFalse");
      const bFallback = byName.get("bFallback");
      const bString = byName.get("bString");
      const start = byName.get("start");
      const rate = byName.get("rate");
      const qty = byName.get("qty");
      const isk = byName.get("isk");
      const usd = byName.get("usd");
      const curNoCode = byName.get("curNoCode");
      const badBounds = byName.get("badBounds");
      const note = byName.get("note");
      const textWeird = byName.get("textWeird");
      const customNumber = byName.get("customNumber");
      assert.ok(flag && bTrue && bFalse && bFallback && bString && start && rate && qty && isk && usd && curNoCode && badBounds && note && textWeird && customNumber);

      assert.equal(flag.type, "checkbox");
      flag.checked = true;
      flag.dispatchFakeEvent("change");

      assert.equal(bTrue.type, "checkbox");
      assert.equal(bTrue.checked, true);
      assert.equal(bFalse.type, "checkbox");
      assert.equal(bFalse.checked, false);
      assert.equal(bFallback.type, "checkbox");
      assert.equal(bFallback.checked, true);
      assert.equal(bString.type, "checkbox");
      assert.equal(bString.checked, true);

      assert.equal(start.type, "date");
      assert.equal(start.value, "2025-01-02");
      start.value = "";
      start.dispatchFakeEvent("input"); // ignored
      start.value = "2025-02-03";
      start.dispatchFakeEvent("input");

      assert.equal(rate.type, "number");
      assert.equal(rate.step, "0.1");
      rate.value = "";
      rate.dispatchFakeEvent("input"); // ignored
      rate.value = "5.5";
      rate.dispatchFakeEvent("input");

      assert.equal(qty.type, "number");
      assert.equal(qty.step, "1");
      assert.equal(qty.min, "0");
      assert.equal(qty.max, "10");
      qty.value = "";
      qty.dispatchFakeEvent("input"); // ignored
      qty.value = "3.9";
      qty.dispatchFakeEvent("input");

      assert.equal(isk.type, "number");
      assert.equal(isk.step, "1");
      isk.value = "10.6";
      isk.dispatchFakeEvent("input");

      assert.equal(usd.type, "number");
      assert.equal(usd.step, "0.01");
      usd.value = "10.6";
      usd.dispatchFakeEvent("input");

      assert.equal(curNoCode.type, "number");
      assert.equal(curNoCode.step, "0.01");

      assert.equal(badBounds.type, "number");
      assert.equal(badBounds.step, "1");
      assert.equal(badBounds.min, "");
      assert.equal(badBounds.max, "");

      assert.equal(note.type, "text");
      assert.equal(note.value, "override");
      note.value = "hi";
      note.dispatchFakeEvent("input");

      assert.equal(textWeird.type, "text");
      assert.equal(textWeird.value, "false");

      assert.equal(customNumber.type, "number");
      assert.equal(customNumber.step, "0.01");
      customNumber.value = "4.5";
      customNumber.dispatchFakeEvent("input");

      assert.deepEqual(events, [
        { name: "flag", value: true },
        { name: "start", value: "2025-02-03" },
        { name: "rate", value: 5.5 },
        { name: "qty", value: 3 },
        { name: "isk", value: 11 },
        { name: "usd", value: 10.6 },
        { name: "note", value: "hi" },
        { name: "customNumber", value: 4.5 },
      ]);

      const overrides = readInputOverrides(root);
      assert.equal(overrides.flag, true);
      assert.equal(overrides.bTrue, true);
      assert.equal(overrides.bFalse, false);
      assert.equal(overrides.bFallback, true);
      assert.equal(overrides.bString, true);
      assert.equal(overrides.start, "2025-02-03");
      assert.equal(overrides.rate, 5.5);
      assert.equal(overrides.qty, 3.9);
      assert.equal(overrides.isk, 10.6);
      assert.equal(overrides.usd, 10.6);
      assert.equal(overrides.curNoCode, 1.2);
      assert.equal(overrides.badBounds, 1);
      assert.equal(overrides.note, "hi");
      assert.equal(overrides.textWeird, "false");
      assert.equal(overrides.customNumber, 4.5);

      const root2 = document.createElement("div");
      renderInputsForm({
        container: root2,
        inputs: [inputDef("d", 1, type("date"), "2025-01-01"), inputDef("n", 2, type("number"), 0)],
      });
      const byName2 = new Map(nodesByTag(root2, "input").map((el) => [el.dataset.name, el]));
      const d = byName2.get("d");
      const n = byName2.get("n");
      assert.ok(d && n);
      d.value = "";
      n.value = "";
      assert.deepEqual(Object.assign({}, readInputOverrides(root2)), {});
    },
    { document: new FakeDocument() }
  ));
