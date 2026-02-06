/**
 * Purpose: Validate view blocks and emit normalized CalcDown view contracts.
 * Intent: Keep cross-block checks deterministic and message-stable.
 */

import type { CalcdownMessage, FencedCodeBlock } from "./types.js";
import { parseViewBlock } from "./views.js";
import { err, normalizeParsedView, sanitizeId, warn } from "./view_contract_common.js";
import { validateCalcdownParsedView } from "./view_contract_validate_view.js";
import type { CalcdownView } from "./view_contract_types.js";

export function validateViewsFromBlocks(blocks: FencedCodeBlock[]): { views: CalcdownView[]; messages: CalcdownMessage[] } {
  const messages: CalcdownMessage[] = [];
  const out: CalcdownView[] = [];
  const seenIds = new Set<string>();

  for (const b of blocks) {
    if (b.lang !== "view") continue;
    const parsed = parseViewBlock(b);
    messages.push(...parsed.messages);
    for (const rawView of parsed.views) {
      const view = normalizeParsedView(rawView);
      const id = view.id ? sanitizeId(view.id) : null;
      const library = view.library ?? "calcdown";
      const line = view.line;

      if (id) {
        if (seenIds.has(id)) {
          err(messages, line, "CD_VIEW_DUPLICATE_ID", `Duplicate view id: ${id}`);
          continue;
        }
        seenIds.add(id);
      }

      if (library !== "calcdown") {
        warn(messages, line, "CD_VIEW_UNSUPPORTED_LIBRARY", `Skipping validation for non-calcdown view library: ${library}`, {
          ...(id ? { nodeName: id } : {}),
        });
        continue;
      }

      const validated = validateCalcdownParsedView(view, messages);
      if (!validated) continue;
      out.push(validated);
    }
  }

  return { views: out, messages };
}
