/**
 * Purpose: Implement deterministic string helpers for std.text.
 * Intent: Support scalar and vector text composition with strict input validation.
 */

import { makeModule, textPartToString } from "./std_shared.js";

function broadcastLen(fn: string, parts: unknown[]): number | null {
  let len: number | null = null;
  for (const p of parts) {
    if (!Array.isArray(p)) continue;
    len = len ?? p.length;
    if (len !== p.length) throw new Error(`${fn}: array length mismatch`);
  }
  return len;
}

function broadcastAt(part: unknown, index: number): unknown {
  return Array.isArray(part) ? part[index] : part;
}

function assertString(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(label);
  return value;
}

function assertInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)) throw new Error(label);
  return value;
}

function assertNonNegativeInteger(value: unknown, label: string): number {
  const n = assertInteger(value, label);
  if (n < 0) throw new Error(label);
  return n;
}

export function createTextModule(): Readonly<Record<string, unknown>> {
  return makeModule({
    concat(...parts: unknown[]): unknown {
      let len: number | null = null;
      for (const p of parts) {
        if (!Array.isArray(p)) continue;
        len = len ?? p.length;
        if (len !== p.length) throw new Error("concat: array length mismatch");
      }

      if (len === null) {
        let out = "";
        for (const p of parts) out += textPartToString(p, "concat");
        return out;
      }

      const out = new Array<string>(len);
      for (let i = 0; i < len; i++) {
        let s = "";
        for (const p of parts) {
          const v = Array.isArray(p) ? p[i] : p;
          s += textPartToString(v, `concat [index ${i}]`);
        }
        out[i] = s;
      }
      return out;
    },
    repeat(value: unknown, count: number): unknown {
      if (!Number.isFinite(count) || !Number.isInteger(count) || count < 0) {
        throw new Error("repeat: count must be a non-negative integer");
      }

      if (typeof value === "string") return value.repeat(count);
      if (!Array.isArray(value)) throw new Error("repeat: expected string or string array");

      const out = new Array<string>(value.length);
      for (let i = 0; i < value.length; i++) {
        const v = value[i];
        if (typeof v !== "string") throw new Error("repeat: expected string array");
        out[i] = v.repeat(count);
      }
      return out;
    },
    upper(value: unknown): unknown {
      if (typeof value === "string") return value.toUpperCase();
      if (!Array.isArray(value)) throw new Error("upper: expected string or string array");
      const out = new Array<string>(value.length);
      for (let i = 0; i < value.length; i++) {
        const v = value[i];
        if (typeof v !== "string") throw new Error("upper: expected string array");
        out[i] = v.toUpperCase();
      }
      return out;
    },
    lower(value: unknown): unknown {
      if (typeof value === "string") return value.toLowerCase();
      if (!Array.isArray(value)) throw new Error("lower: expected string or string array");
      const out = new Array<string>(value.length);
      for (let i = 0; i < value.length; i++) {
        const v = value[i];
        if (typeof v !== "string") throw new Error("lower: expected string array");
        out[i] = v.toLowerCase();
      }
      return out;
    },
    trim(value: unknown): unknown {
      if (typeof value === "string") return value.trim();
      if (!Array.isArray(value)) throw new Error("trim: expected string or string array");
      const out = new Array<string>(value.length);
      for (let i = 0; i < value.length; i++) {
        const v = value[i];
        if (typeof v !== "string") throw new Error("trim: expected string array");
        out[i] = v.trim();
      }
      return out;
    },
    length(value: unknown): unknown {
      if (typeof value === "string") return value.length;
      if (!Array.isArray(value)) throw new Error("length: expected string or string array");
      const out = new Array<number>(value.length);
      for (let i = 0; i < value.length; i++) {
        const v = value[i];
        if (typeof v !== "string") throw new Error("length: expected string array");
        out[i] = v.length;
      }
      return out;
    },
    slice(value: unknown, start: unknown, end?: unknown): unknown {
      const len = broadcastLen("slice", [value, start, end]);
      if (len === null) {
        const s = assertString(value, "slice: expected string or string array");
        const a = assertInteger(start, "slice: start must be integer");
        if (end === undefined) return s.slice(a);
        const b = assertInteger(end, "slice: end must be integer");
        return s.slice(a, b);
      }

      const out = new Array<string>(len);
      for (let i = 0; i < len; i++) {
        const s = assertString(broadcastAt(value, i), "slice: expected string or string array");
        const a = assertInteger(broadcastAt(start, i), "slice: start must be integer");
        const bRaw = end === undefined ? undefined : broadcastAt(end, i);
        if (bRaw === undefined) {
          out[i] = s.slice(a);
        } else {
          const b = assertInteger(bRaw, "slice: end must be integer");
          out[i] = s.slice(a, b);
        }
      }
      return out;
    },
    split(value: unknown, sep: unknown): unknown {
      const len = broadcastLen("split", [value, sep]);
      if (len === null) {
        const s = assertString(value, "split: expected string or string array");
        const by = assertString(sep, "split: expected separator string");
        return s.split(by);
      }

      const out = new Array<string[]>(len);
      for (let i = 0; i < len; i++) {
        const s = assertString(broadcastAt(value, i), "split: expected string or string array");
        const by = assertString(broadcastAt(sep, i), "split: expected separator string");
        out[i] = s.split(by);
      }
      return out;
    },
    startsWith(value: unknown, prefix: unknown): unknown {
      const len = broadcastLen("startsWith", [value, prefix]);
      if (len === null) {
        const s = assertString(value, "startsWith: expected string or string array");
        const p = assertString(prefix, "startsWith: expected prefix string");
        return s.startsWith(p);
      }
      const out = new Array<boolean>(len);
      for (let i = 0; i < len; i++) {
        const s = assertString(broadcastAt(value, i), "startsWith: expected string or string array");
        const p = assertString(broadcastAt(prefix, i), "startsWith: expected prefix string");
        out[i] = s.startsWith(p);
      }
      return out;
    },
    contains(value: unknown, needle: unknown): unknown {
      const len = broadcastLen("contains", [value, needle]);
      if (len === null) {
        const s = assertString(value, "contains: expected string or string array");
        const n = assertString(needle, "contains: expected needle string");
        return s.includes(n);
      }
      const out = new Array<boolean>(len);
      for (let i = 0; i < len; i++) {
        const s = assertString(broadcastAt(value, i), "contains: expected string or string array");
        const n = assertString(broadcastAt(needle, i), "contains: expected needle string");
        out[i] = s.includes(n);
      }
      return out;
    },
    padStart(value: unknown, targetLength: unknown, padString?: unknown): unknown {
      const len = broadcastLen("padStart", [value, targetLength, padString]);
      if (len === null) {
        const s = assertString(value, "padStart: expected string or string array");
        const n = assertNonNegativeInteger(targetLength, "padStart: targetLength must be a non-negative integer");
        const pad = padString === undefined ? " " : assertString(padString, "padStart: padString must be a string");
        return s.padStart(n, pad);
      }

      const out = new Array<string>(len);
      for (let i = 0; i < len; i++) {
        const s = assertString(broadcastAt(value, i), "padStart: expected string or string array");
        const n = assertNonNegativeInteger(
          broadcastAt(targetLength, i),
          "padStart: targetLength must be a non-negative integer"
        );
        const padRaw = padString === undefined ? " " : broadcastAt(padString, i);
        const pad = assertString(padRaw, "padStart: padString must be a string");
        out[i] = s.padStart(n, pad);
      }
      return out;
    },
    format(template: unknown, ...args: unknown[]): unknown {
      const len = broadcastLen("format", [template, ...args]);

      const formatScalar = (tmpl: string, scalars: unknown[]): string => {
        return tmpl.replace(/\{(\d+)\}/g, (_match: string, idxText: string) => {
          const idx = Number(idxText);
          if (!Number.isInteger(idx) || idx < 0) return `{${idxText}}`;
          if (idx >= scalars.length) throw new Error(`format: missing argument {${idx}}`);
          return textPartToString(scalars[idx], `format {${idx}}`);
        });
      };

      if (len === null) {
        const tmpl = assertString(template, "format: expected template string");
        return formatScalar(tmpl, args);
      }

      const out = new Array<string>(len);
      for (let i = 0; i < len; i++) {
        const tmpl = assertString(broadcastAt(template, i), "format: expected template string");
        const scalars = args.map((a) => broadcastAt(a, i));
        out[i] = formatScalar(tmpl, scalars);
      }
      return out;
    },
  });
}
