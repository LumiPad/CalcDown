/**
 * Purpose: Run CalcDown parse, evaluate, and view validation in one call.
 * Intent: Provide a simple browser-first execution wrapper for integrations.
 */

import { evaluateProgram, parseProgram } from "../index.js";
import type { CalcdownProgram } from "../index.js";
import type { CalcdownMessage } from "../types.js";
import type { StdRuntimeContext } from "../stdlib/std.js";
import type { CalcdownView, ValueFormat } from "../view_contract.js";
import { validateViewsFromBlocks } from "../view_contract.js";

export interface CalcdownRunResult {
  program: CalcdownProgram;
  values: Record<string, unknown>;
  views: CalcdownView[];
  parseMessages: CalcdownMessage[];
  evalMessages: CalcdownMessage[];
  viewMessages: CalcdownMessage[];
}

export interface RunCalcdownOptions {
  overrides?: Record<string, unknown>;
  context?: StdRuntimeContext;
  validateViewSources?: boolean;
}

function isPercentPointsFormat(format: ValueFormat | undefined): boolean {
  if (!format) return false;
  if (format === "percent" || format === "percent_points") return true;
  if (typeof format !== "object") return false;
  if (format.kind !== "percent") return false;
  if (format.scale === undefined) return true;
  return typeof format.scale === "number" && Number.isFinite(format.scale) && format.scale === 1;
}

function shouldWarnPercentPointsLikelyRatio(values: number[]): { warn: boolean; maxAbs: number; sampleCount: number } {
  if (values.length === 0) return { warn: false, maxAbs: 0, sampleCount: 0 };
  const scan = values.slice(0, 200);
  let maxAbs = 0;
  let inRange = 0;
  for (const v of scan) {
    const abs = Math.abs(v);
    maxAbs = Math.max(maxAbs, abs);
    if (v >= 0 && v <= 1) inRange++;
  }

  // Heuristic: if percent-point formatting is applied to values that are *mostly* 0..1,
  // it often means the author computed a ratio (e.g. count/total) but used "percent" (points).
  const fracInRange = inRange / scan.length;
  const warn = fracInRange >= 0.9 && maxAbs <= 1 && maxAbs >= 0.01;
  return { warn, maxAbs, sampleCount: scan.length };
}

function percentFormatWarnings(views: CalcdownView[], values: Record<string, unknown>): CalcdownMessage[] {
  const messages: CalcdownMessage[] = [];

  for (const v of views) {
    if (v.type !== "table") continue;
    const cols = v.spec.columns;
    if (!Array.isArray(cols) || cols.length === 0) continue;

    const rawRows = values[v.source];
    if (!Array.isArray(rawRows)) continue;
    const rows = rawRows.filter((r) => r && typeof r === "object" && !Array.isArray(r)) as Record<string, unknown>[];
    if (rows.length === 0) continue;

    for (const c of cols) {
      if (!isPercentPointsFormat(c.format)) continue;

      const nums: number[] = [];
      for (const row of rows) {
        const raw = Object.prototype.hasOwnProperty.call(row, c.key) ? row[c.key] : undefined;
        if (typeof raw === "number" && Number.isFinite(raw)) nums.push(raw);
      }
      const diag = shouldWarnPercentPointsLikelyRatio(nums);
      if (!diag.warn) continue;

      messages.push({
        severity: "warning",
        code: "CD_VIEW_FORMAT_PERCENT_POINTS_LIKELY_RATIO",
        message:
          `View column "${c.key}" is formatted as percent points ("percent"), but observed values look like 0..1 ratios (maxAbs=${diag.maxAbs}, n=${diag.sampleCount}). ` +
          `If you intended a ratio, use format "percent01" (alias "percent_ratio") or { kind: "percent", scale: 100 } ` +
          `or compute percent points with std.percent.of(part, whole).`,
        line: v.line,
        blockLang: "view",
        nodeName: v.id,
      });
    }
  }

  return messages;
}

export function runCalcdown(markdown: string, opts: RunCalcdownOptions = {}): CalcdownRunResult {
  const parsed = parseProgram(markdown);
  const evaluated = evaluateProgram(parsed.program, opts.overrides ?? {}, opts.context ?? {});

  const validated = validateViewsFromBlocks(parsed.program.blocks);
  const viewMessages: CalcdownMessage[] = [...validated.messages];

  if (opts.validateViewSources ?? true) {
    const known = new Set<string>();
    for (const t of parsed.program.tables) known.add(t.name);
    for (const n of parsed.program.nodes) known.add(n.name);

    for (const v of validated.views) {
      if (v.type !== "table" && v.type !== "chart") continue;
      const src = v.source;
      if (!known.has(src)) {
        viewMessages.push({
          severity: "error",
          code: "CD_VIEW_UNKNOWN_SOURCE",
          message: `View source does not exist: ${src}`,
          line: v.line,
          blockLang: "view",
          nodeName: v.id,
        });
      }
    }
  }

  viewMessages.push(...percentFormatWarnings(validated.views, evaluated.values));

  return {
    program: parsed.program,
    values: evaluated.values,
    views: validated.views,
    parseMessages: parsed.messages,
    evalMessages: evaluated.messages,
    viewMessages,
  };
}
