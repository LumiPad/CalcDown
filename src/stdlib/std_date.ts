/**
 * Purpose: Implement time-aware helpers for std.date.
 * Intent: Keep date parsing, formatting, and session time behavior deterministic.
 */

import { addMonthsUTC, formatIsoDate, parseIsoDate } from "../util/date.js";
import { makeModule } from "./std_shared.js";

function assertValidDate(v: unknown, fn: string): Date {
  if (!(v instanceof Date) || Number.isNaN(v.getTime())) throw new Error(`${fn}: invalid date`);
  return v;
}

function assertInteger(v: unknown, fn: string, label: string): number {
  if (typeof v !== "number" || !Number.isFinite(v) || !Number.isInteger(v)) {
    throw new Error(`${fn}: ${label} must be integer`);
  }
  return v;
}

function utcMidnightFromDate(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

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

    year(date: Date): number {
      return assertValidDate(date, "year").getUTCFullYear();
    },

    month(date: Date): number {
      const d = assertValidDate(date, "month");
      return d.getUTCMonth() + 1;
    },

    day(date: Date): number {
      return assertValidDate(date, "day").getUTCDate();
    },

    quarter(date: Date): number {
      const d = assertValidDate(date, "quarter");
      return Math.floor(d.getUTCMonth() / 3) + 1;
    },

    weekday(date: Date): number {
      const d = assertValidDate(date, "weekday");
      const day = d.getUTCDay(); // 0..6 (Sun..Sat)
      return day === 0 ? 7 : day;
    },

    addDays(date: Date, days: number): Date {
      const d = assertValidDate(date, "addDays");
      const delta = assertInteger(days, "addDays", "days");
      return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + delta));
    },

    addYears(date: Date, years: number): Date {
      const d = assertValidDate(date, "addYears");
      const delta = assertInteger(years, "addYears", "years");
      const targetYear = d.getUTCFullYear() + delta;
      const month = d.getUTCMonth();
      const day = d.getUTCDate();
      const endOfTargetMonth = new Date(Date.UTC(targetYear, month + 1, 0));
      const clampedDay = Math.min(day, endOfTargetMonth.getUTCDate());
      return new Date(Date.UTC(targetYear, month, clampedDay));
    },

    diffDays(d1: Date, d2: Date): number {
      const a = utcMidnightFromDate(assertValidDate(d1, "diffDays"));
      const b = utcMidnightFromDate(assertValidDate(d2, "diffDays"));
      return Math.trunc((b.getTime() - a.getTime()) / MS_PER_DAY);
    },

    diffMonths(d1: Date, d2: Date): number {
      const a = assertValidDate(d1, "diffMonths");
      const b = assertValidDate(d2, "diffMonths");
      return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
    },

    startOfMonth(date: Date): Date {
      const d = assertValidDate(date, "startOfMonth");
      return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
    },

    endOfMonth(date: Date): Date {
      const d = assertValidDate(date, "endOfMonth");
      return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
    },

    startOfQuarter(date: Date): Date {
      const d = assertValidDate(date, "startOfQuarter");
      const qm = Math.floor(d.getUTCMonth() / 3) * 3;
      return new Date(Date.UTC(d.getUTCFullYear(), qm, 1));
    },

    monthRange(start: Date, end: Date): Date[] {
      const s = assertValidDate(start, "monthRange");
      const e = assertValidDate(end, "monthRange");
      const startMonth = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), 1));
      const endMonth = new Date(Date.UTC(e.getUTCFullYear(), e.getUTCMonth(), 1));
      if (endMonth.getTime() < startMonth.getTime()) throw new Error("monthRange: end must be on or after start");

      const out: Date[] = [];
      let cur = startMonth;
      while (cur.getTime() <= endMonth.getTime()) {
        out.push(new Date(cur.getTime()));
        cur = addMonthsUTC(cur, 1);
      }
      return out;
    },

    workdays(start: Date, end: Date): Date[] {
      const s = utcMidnightFromDate(assertValidDate(start, "workdays"));
      const e = utcMidnightFromDate(assertValidDate(end, "workdays"));
      if (e.getTime() < s.getTime()) throw new Error("workdays: end must be on or after start");
      const days = Math.trunc((e.getTime() - s.getTime()) / MS_PER_DAY);
      const out: Date[] = [];
      for (let i = 0; i <= days; i++) {
        const d = new Date(s.getTime() + i * MS_PER_DAY);
        const wd = d.getUTCDay();
        if (wd === 0 || wd === 6) continue;
        out.push(d);
      }
      return out;
    },
  });
}
