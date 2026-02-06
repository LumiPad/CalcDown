/**
 * Purpose: Implement assertion helper for std.assert.
 * Intent: Surface explicit model-level failures with deterministic messages.
 */

import { makeModule } from "./std_shared.js";

export function createAssertModule(): Readonly<Record<string, unknown>> {
  return makeModule({
    that(condition: unknown, message = "Assertion failed"): void {
      if (!condition) throw new Error(message);
    },
  });
}
