import assert from "node:assert/strict";
import { test } from "node:test";

import { std } from "../dist/stdlib/std.js";

test("stdlib: extra branch coverage for std.array / std.logic / std.date", () => {
  assert.throws(() => std.array.indexOf([1, 2], Number.POSITIVE_INFINITY), /indexOf: expected finite numbers/);
  assert.throws(() => std.array.indexOf([new Date(Number.NaN)], new Date()), /indexOf: invalid date/);
  assert.equal(std.array.at([1, 2], -99), null);
  assert.deepEqual(Object.assign({}, std.array.countBy([{ cat: 1 }, { cat: 2 }, { cat: 1 }], "cat")), { "1": 2, "2": 1 });

  assert.deepEqual(std.logic.coalesce([null, undefined], [undefined, null]), [null, null]);
  assert.equal(std.logic.where(false, 1, 2), 2);

  assert.equal(std.date.weekday(new Date(Date.UTC(2024, 0, 7))), 7);
});

test("stdlib: extra branch coverage for std.stats", () => {
  assert.throws(() => std.stats.median("nope"), /median: expected array/);
  assert.throws(() => std.stats.median([1, Number.NaN]), /median: expected finite number array/);

  assert.throws(() => std.stats.covariance([1, 2], [1, 2, 3]), /covariance: array length mismatch/);
  assert.throws(
    () => std.stats.correlation([1, 2, 3], [1, 1, 1]),
    /correlation: undefined \(zero variance\)/
  );

  assert.throws(
    () => std.stats.variance([1e308, -1e308]),
    /Non-finite numeric result/
  );
  assert.throws(
    () => std.stats.percentile([1e308, -1e308], 50),
    /Non-finite numeric result/
  );
  assert.throws(
    () => std.stats.covariance([1e308, -1e308], [1e308, -1e308]),
    /Non-finite numeric result/
  );

  assert.throws(
    () => std.stats.linearFit([0, 2.2e-6], [0, 2e306]),
    /Non-finite numeric result/
  );
  assert.throws(() => std.stats.linearFit([0, 1, 2], [0, 1e308, 0]), /Non-finite numeric result/);

  assert.throws(() => std.stats.predict({ slope: Number.POSITIVE_INFINITY, intercept: 0 }, 1), /slope must be finite/);
  assert.throws(() => std.stats.predict({ slope: 1, intercept: 0 }, Number.NaN), /x must be finite/);
  assert.throws(() => std.stats.predict({ slope: 1e308, intercept: 0 }, 2), /Non-finite numeric result/);
});
