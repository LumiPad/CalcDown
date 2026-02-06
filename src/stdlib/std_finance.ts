/**
 * Purpose: Implement financial primitives for std.finance.
 * Intent: Provide deterministic loan-rate and payment calculations.
 */

import { makeModule, pmt } from "./std_shared.js";

export function createFinanceModule(): Readonly<Record<string, unknown>> {
  return makeModule({
    toMonthlyRate(annualPercent: number): number {
      if (!Number.isFinite(annualPercent)) throw new Error("toMonthlyRate: annualPercent must be finite");
      return annualPercent / 100 / 12;
    },
    pmt,
  });
}
