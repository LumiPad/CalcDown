/**
 * Purpose: Implement financial primitives for std.finance.
 * Intent: Provide deterministic loan-rate and payment calculations.
 */

import { makeModule, pmt } from "./std_shared.js";

function assertFiniteResult(n: number): number {
  if (!Number.isFinite(n)) throw new Error("Non-finite numeric result");
  return n;
}

function assertFiniteNonZero(n: number): number {
  if (!Number.isFinite(n) || n === 0) throw new Error("Non-finite numeric result");
  return n;
}

function irrNpvAt(cfs: number[], rate: number): number {
  const denom = 1 + rate;
  let f = 0;
  for (let t = 0; t < cfs.length; t++) {
    const cf = cfs[t]!;
    if (cf === 0) continue;
    const pow = assertFiniteNonZero(denom ** t);
    f += cf / pow;
  }
  return assertFiniteResult(f);
}

export function createFinanceModule(): Readonly<Record<string, unknown>> {
  function assertFiniteNumber(v: unknown, label: string): number {
    if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`${label} must be finite`);
    return v;
  }

  function assertInteger(v: unknown, label: string): number {
    const n = assertFiniteNumber(v, label);
    if (!Number.isInteger(n)) throw new Error(`${label} must be an integer`);
    return n;
  }

  function assertRate(rate: unknown): number {
    const r = assertFiniteNumber(rate, "rate");
    if (r <= -1) throw new Error("rate must be > -1");
    return r;
  }

  function assertType(type: unknown): 0 | 1 {
    if (type === undefined) return 0;
    const t = assertFiniteNumber(type, "type");
    if (t !== 0 && t !== 1) throw new Error("type must be 0 or 1");
    return t as 0 | 1;
  }

  function paymentParts(
    rate: number,
    per: number,
    nper: number,
    pv: number,
    fv: number,
    type: 0 | 1
  ): { interest: number; principal: number } {
    if (per < 1 || per > nper) throw new Error("per must be in [1, nper]");

    const payment = pmt(rate, nper, pv, fv, type);

    let balance = pv;

    if (type === 0) {
      let interestPaid = 0;
      let principalPaid = 0;
      for (let k = 1; k <= per; k++) {
        const interestAccrued = assertFiniteResult(balance * rate);
        interestPaid = -interestAccrued;
        principalPaid = assertFiniteResult(payment - interestPaid);
        if (k !== per) {
          balance = assertFiniteResult(balance + interestAccrued + payment);
        }
      }
      return { interest: interestPaid, principal: principalPaid };
    }

    // type === 1: payments at beginning of period.
    let interestPaid = 0;
    let principalPaid = 0;
    for (let k = 1; k <= per; k++) {
      if (k === 1) {
        interestPaid = 0;
        principalPaid = payment;
      } else {
        const prevAfter = assertFiniteResult(balance / (1 + rate));
        const interestAccrued = assertFiniteResult(prevAfter * rate);
        interestPaid = -interestAccrued;
        principalPaid = assertFiniteResult(payment - interestPaid);
      }

      if (k !== per) {
        balance = assertFiniteResult(balance + payment);
        balance = assertFiniteResult(balance * (1 + rate));
      }
    }
    return { interest: interestPaid, principal: principalPaid };
  }

  function npv(rate: unknown, cashflows: unknown): number {
    const r = assertRate(rate);
    if (!Array.isArray(cashflows)) throw new Error("npv: expected cashflows array");
    let out = 0;
    for (let i = 0; i < cashflows.length; i++) {
      const cf = cashflows[i];
      if (typeof cf !== "number" || !Number.isFinite(cf)) throw new Error("npv: expected finite number array");
      const denom = (1 + r) ** (i + 1);
      if (!Number.isFinite(denom) || denom === 0) throw new Error("npv: invalid discount rate");
      const term = assertFiniteResult(cf / denom);
      out = assertFiniteResult(out + term);
    }
    return out;
  }

  return makeModule({
    toMonthlyRate(annualPercent: number): number {
      if (!Number.isFinite(annualPercent)) throw new Error("toMonthlyRate: annualPercent must be finite");
      return annualPercent / 100 / 12;
    },
    pmt,
    ipmt(rate: number, per: number, nper: number, pv: number, fv = 0, type?: number): number {
      const r = assertRate(rate);
      const p = assertInteger(per, "per");
      const n = assertInteger(nper, "nper");
      if (n <= 0) throw new Error("nper must be a positive integer");
      const present = assertFiniteNumber(pv, "pv");
      const future = assertFiniteNumber(fv, "fv");
      const t = assertType(type);
      return paymentParts(r, p, n, present, future, t).interest;
    },
    ppmt(rate: number, per: number, nper: number, pv: number, fv = 0, type?: number): number {
      const r = assertRate(rate);
      const p = assertInteger(per, "per");
      const n = assertInteger(nper, "nper");
      if (n <= 0) throw new Error("nper must be a positive integer");
      const present = assertFiniteNumber(pv, "pv");
      const future = assertFiniteNumber(fv, "fv");
      const t = assertType(type);
      const payment = pmt(r, n, present, future, t);
      const parts = paymentParts(r, p, n, present, future, t);
      return assertFiniteResult(payment - parts.interest);
    },
    npv,
    irr(cashflows: unknown, guess = 0.1): number {
      if (!Array.isArray(cashflows)) throw new Error("irr: expected cashflows array");
      if (cashflows.length < 2) throw new Error("irr: cashflows must have at least 2 values");
      const cfs: number[] = [];
      let hasPos = false;
      let hasNeg = false;
      for (const v of cashflows) {
        if (typeof v !== "number" || !Number.isFinite(v)) throw new Error("irr: expected finite number array");
        if (v > 0) hasPos = true;
        if (v < 0) hasNeg = true;
        cfs.push(v);
      }
      if (!hasPos || !hasNeg) throw new Error("irr: cashflows must include both positive and negative values");

      const tol = 1e-10;
      assertRate(guess);

      const candidates = [-0.9999, -0.9, -0.75, -0.5, -0.25, -0.1, -0.05, 0, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100];
      const values: number[] = [];
      for (const rr of candidates) {
        try {
          values.push(irrNpvAt(cfs, rr));
        } catch {
          values.push(Number.NaN);
        }
      }

      for (let i = 0; i < candidates.length - 1; i++) {
        const a = candidates[i]!;
        const b = candidates[i + 1]!;
        const fa = values[i]!;
        const fb = values[i + 1]!;
        if (!Number.isFinite(fa) || !Number.isFinite(fb)) continue;
        if (fa === 0) return a;
        if (fb === 0) return b;
        if (fa < 0 && fb > 0) {
          return bisectIrr(cfs, a, b, tol);
        }
        if (fa > 0 && fb < 0) {
          return bisectIrr(cfs, a, b, tol);
        }
      }

      throw new Error("irr: could not find a root");
    },
  });
}

function bisectIrr(cfs: number[], low: number, high: number, tol: number): number {
  let a = low;
  let b = high;
  let fa = irrNpvAt(cfs, a);
  irrNpvAt(cfs, b);

  for (let iter = 0; iter < 100; iter++) {
    const mid = (a + b) / 2;
    const fm = irrNpvAt(cfs, mid);
    if (Math.abs(fm) <= tol) {
      a = mid;
      b = mid;
      break;
    }
    if ((fa < 0 && fm > 0) || (fa > 0 && fm < 0)) {
      b = mid;
      continue;
    }
    a = mid;
    fa = fm;
  }

  return (a + b) / 2;
}
