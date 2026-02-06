/**
 * Purpose: Orchestrate CalcDown evaluation across inputs, tables, nodes, and patches.
 * Intent: Keep runtime flow deterministic while preserving stable diagnostics.
 */

import { evaluateNodes } from "./calcscript/eval.js";
import { applyTablePatches, collectTablePatches } from "./program_patches.js";
import type { CalcdownProgram } from "./program_types.js";
import { cloneTableRows, normalizeOverrideValue } from "./program_values.js";
import { createStd, type StdRuntimeContext } from "./stdlib/std.js";
import type { CalcdownMessage } from "./types.js";

export function evaluateProgram(
  program: CalcdownProgram,
  overrides: Record<string, unknown> = {},
  context: StdRuntimeContext = {}
): { values: Record<string, unknown>; messages: CalcdownMessage[] } {
  const messages: CalcdownMessage[] = [];

  const inputs: Record<string, unknown> = Object.create(null);
  for (const def of program.inputs) {
    inputs[def.name] = def.defaultValue;
  }

  const tables: Record<string, unknown> = Object.create(null);
  for (const t of program.tables) {
    tables[t.name] = cloneTableRows(t.rows);
  }

  const parsedPatches = collectTablePatches(program.blocks);
  messages.push(...parsedPatches.messages);

  for (const [key, value] of Object.entries(overrides)) {
    const def = program.inputs.find((d) => d.name === key);
    if (!def) {
      if (key in tables) {
        tables[key] = cloneTableRows(value);
        continue;
      }
      messages.push({ severity: "warning", code: "CD_OVERRIDE_UNKNOWN", message: `Unknown override: ${key}` });
      continue;
    }
    try {
      inputs[key] = normalizeOverrideValue(def, value);
    } catch (err) {
      messages.push({
        severity: "error",
        code: "CD_OVERRIDE_INVALID",
        message: err instanceof Error ? err.message : String(err),
        nodeName: key,
      });
    }
  }

  let currentDateTime: Date;
  const overrideNow = context.currentDateTime;
  if (overrideNow === undefined) {
    currentDateTime = new Date();
  } else if (!(overrideNow instanceof Date) || Number.isNaN(overrideNow.getTime())) {
    messages.push({
      severity: "error",
      code: "CD_CONTEXT_INVALID_DATETIME",
      message: "Invalid currentDateTime override (expected a valid Date)",
    });
    currentDateTime = new Date();
  } else {
    currentDateTime = overrideNow;
  }

  const runtimeStd = createStd({ currentDateTime });

  // Optional runtime row ordering for tables.
  // Storage is canonicalized by primaryKey via `calcdown fmt`; `sortBy` controls presentation order.
  const stdDataSortBy = (runtimeStd as any)?.data?.sortBy;
  if (typeof stdDataSortBy === "function") {
    for (const t of program.tables) {
      const key = t.sortBy;
      if (!key) continue;
      const rows = tables[t.name];
      if (!Array.isArray(rows)) continue;
      try {
        tables[t.name] = stdDataSortBy(rows, key);
      } catch (err) {
        messages.push({
          severity: "error",
          code: "CD_DATA_SORTBY_RUNTIME",
          message: err instanceof Error ? err.message : String(err),
          line: t.line,
          nodeName: t.name,
          blockLang: "data",
        });
      }
    }
  }

  const tablePkByArray = new WeakMap<object, { primaryKey: string }>();
  for (const t of program.tables) {
    const rows = tables[t.name];
    if (Array.isArray(rows)) tablePkByArray.set(rows, { primaryKey: t.primaryKey });
  }

  const evalRes = evaluateNodes(
    program.nodes,
    Object.assign(Object.create(null), inputs, tables),
    runtimeStd,
    tablePkByArray
  );
  messages.push(...evalRes.messages);

  messages.push(
    ...applyTablePatches({
      patches: parsedPatches.patches,
      schemas: program.tables,
      tables,
      env: evalRes.env,
      std: runtimeStd,
      tablePkByArray,
    })
  );

  const values: Record<string, unknown> = Object.assign(Object.create(null), inputs, tables, evalRes.values);
  return { values, messages };
}
