/**
 * Purpose: Implement time-aware helpers for std.date.
 * Intent: Keep date parsing, formatting, and session time behavior deterministic.
 */

import { addMonthsUTC, formatIsoDate, parseIsoDate } from "../util/date.js";
import { makeModule } from "./std_shared.js";

export function createDateModule(getNow: () => Date): Readonly<Record<string, unknown>> {
  return makeModule({
    now(): Date {
      return getNow();
    },
    today(): Date {
      const dt = getNow();
      return new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()));
    },
    parse(value: string): Date {
      if (typeof value !== "string") throw new Error("parse: expected ISO date string");
      return parseIsoDate(value);
    },
    format(date: Date, template: string): string {
      if (!(date instanceof Date) || Number.isNaN(date.getTime())) throw new Error("format: invalid date");
      if (typeof template !== "string") throw new Error("format: expected template string");
      if (template === "%Y-%m-%d") return formatIsoDate(date);

      let out = "";
      for (let i = 0; i < template.length; i++) {
        const ch = template[i]!;
        if (ch !== "%") {
          out += ch;
          continue;
        }
        const next = template[i + 1];
        if (!next) throw new Error("format: dangling %");
        i++;
        if (next === "%") {
          out += "%";
          continue;
        }
        if (next === "Y") {
          out += String(date.getUTCFullYear()).padStart(4, "0");
          continue;
        }
        if (next === "m") {
          out += String(date.getUTCMonth() + 1).padStart(2, "0");
          continue;
        }
        if (next === "d") {
          out += String(date.getUTCDate()).padStart(2, "0");
          continue;
        }
        throw new Error(`format: unsupported token: %${next}`);
      }

      return out;
    },
    addMonths(date: Date, months: number): Date {
      if (!(date instanceof Date) || Number.isNaN(date.getTime())) throw new Error("addMonths: invalid date");
      if (!Number.isFinite(months) || !Number.isInteger(months)) throw new Error("addMonths: months must be integer");
      return addMonthsUTC(date, months);
    },
  });
}
