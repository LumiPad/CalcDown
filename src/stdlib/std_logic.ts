/**
 * Purpose: Provide conditional helpers for CalcDown models.
 * Intent: Keep branching readable while staying deterministic and sandboxable.
 */

import { makeModule } from "./std_shared.js";

function isNullish(v: unknown): boolean {
  return v === null || v === undefined;
}

function broadcastLen(fn: string, parts: unknown[]): number | null {
  let len: number | null = null;
  for (const p of parts) {
    if (!Array.isArray(p)) continue;
    if (len === null) len = p.length;
    else if (p.length !== len) throw new Error(`${fn}: array length mismatch`);
  }
  return len;
}

function broadcastAt(part: unknown, i: number): unknown {
  return Array.isArray(part) ? part[i] : part;
}

export function createLogicModule(): Readonly<Record<string, unknown>> {
  return makeModule({
    cond(...args: unknown[]): unknown {
      if (args.length < 1) throw new Error("cond: expected arguments");
      if (args.length % 2 === 0) throw new Error("cond: expected condition/value pairs plus a default value");

      for (let i = 0; i < args.length - 1; i += 2) {
        const cond = args[i];
        if (typeof cond !== "boolean") throw new Error("cond: conditions must be boolean");
        if (cond) return args[i + 1];
      }
      return args[args.length - 1];
    },

    coalesce(...values: unknown[]): unknown {
      if (values.length === 0) throw new Error("coalesce: expected at least 1 value");

      const len = broadcastLen("coalesce", values);
      if (len === null) {
        for (const v of values) {
          if (!isNullish(v)) return v;
        }
        return null;
      }

      const out = new Array<unknown>(len);
      for (let i = 0; i < len; i++) {
        let picked: unknown = null;
        for (const v of values) {
          const at = broadcastAt(v, i);
          if (!isNullish(at)) {
            picked = at;
            break;
          }
        }
        out[i] = picked;
      }
      return out;
    },

    isPresent(value: unknown): unknown {
      if (Array.isArray(value)) return value.map((v) => !isNullish(v));
      return !isNullish(value);
    },

    where(test: unknown, whenTrue: unknown, whenFalse: unknown): unknown {
      const len = broadcastLen("where", [test, whenTrue, whenFalse]);
      if (len === null) {
        if (typeof test !== "boolean") throw new Error("where: test must be boolean");
        return test ? whenTrue : whenFalse;
      }

      const out = new Array<unknown>(len);
      for (let i = 0; i < len; i++) {
        const t = broadcastAt(test, i);
        if (typeof t !== "boolean") throw new Error("where: test must be boolean");
        out[i] = t ? broadcastAt(whenTrue, i) : broadcastAt(whenFalse, i);
      }
      return out;
    },
  });
}

