import assert from "node:assert/strict";
import { test } from "node:test";

import { formatFormattedValue, formatValue } from "../dist/web/format.js";

test("web format: formatValue covers scalar/object fallback branches", () => {
  const d = new Date("2025-03-04T00:00:00Z");
  assert.equal(formatValue(d), "2025-03-04");

  assert.equal(formatValue(true), "true");
  assert.equal(formatValue(false), "false");
  assert.equal(formatValue("x"), "x");
  assert.equal(formatValue(null), "null");
  assert.equal(formatValue(undefined), "—");
  assert.equal(formatValue([1, 2, 3]), "[array × 3]");
  assert.equal(formatValue({ a: 1 }), "[object]");

  assert.equal(formatValue(Number.NaN), "NaN");
  assert.equal(formatValue(Number.POSITIVE_INFINITY), "Infinity");
});

test("web format: formatFormattedValue date/percent/currency/integer/number branches", () => {
  const date = new Date("2025-01-02T00:00:00Z");
  assert.equal(formatFormattedValue(date, "date"), "2025-01-02");
  assert.equal(formatFormattedValue("2025-01-02", "date"), "2025-01-02");
  assert.equal(formatFormattedValue(123, "date"), formatValue(123));

  assert.match(formatFormattedValue(0.125, { kind: "percent", scale: 100, digits: 1 }), /^\p{Number}+(?:\.\p{Number}+)?%$/u);
  assert.equal(formatFormattedValue("x", { kind: "percent", scale: 100 }), "x");

  assert.equal(formatFormattedValue(10, "currency"), formatValue(10));
  const usd = formatFormattedValue(12.34, { kind: "currency", currency: "usd", digits: 1 });
  assert.match(usd, /12(?:\.|,)3|12(?:\.|,)4/);

  const isk = formatFormattedValue(154.9, { kind: "currency", currency: "ISK", digits: 2 });
  assert.doesNotMatch(isk, /[.,]\d/);

  const intOut = formatFormattedValue(2025.99, "integer");
  assert.match(intOut, /^\p{Number}{4}$/u);
  assert.equal(formatFormattedValue("oops", "integer"), "oops");

  const numOut = formatFormattedValue(1234.567, { kind: "number", digits: 2 });
  assert.match(numOut, /^1[,\u00A0]?\p{Number}{3}(?:[.,]\p{Number}{1,2})?$/u);
  assert.equal(formatFormattedValue("n/a", { kind: "number", digits: 2 }), "n/a");
});
