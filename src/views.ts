import { CalcdownMessage, FencedCodeBlock } from "./types.js";

export interface ParsedView {
  raw: unknown;
  line: number;
  id?: string;
  type?: string;
  library?: string;
  source?: string;
  spec?: unknown;
}

export function parseViewBlock(block: FencedCodeBlock): { view: ParsedView | null; messages: CalcdownMessage[] } {
  const messages: CalcdownMessage[] = [];
  const text = block.content.trim();

  if (!text) {
    messages.push({
      severity: "error",
      message: "Empty view block",
      line: block.fenceLine + 1,
      blockLang: block.lang,
    });
    return { view: null, messages };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    messages.push({
      severity: "error",
      message:
        "View blocks currently require JSON in the demo (YAML parsing not implemented yet).",
      line: block.fenceLine + 1,
      blockLang: block.lang,
    });
    return { view: null, messages };
  }

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    messages.push({
      severity: "error",
      message: "View JSON must be an object",
      line: block.fenceLine + 1,
      blockLang: block.lang,
    });
    return { view: null, messages };
  }

  const obj = raw as Record<string, unknown>;

  const view: ParsedView = {
    raw,
    line: block.fenceLine + 1,
    ...(typeof obj.id === "string" ? { id: obj.id } : {}),
    ...(typeof obj.type === "string" ? { type: obj.type } : {}),
    ...(typeof obj.library === "string" ? { library: obj.library } : {}),
    ...(typeof obj.source === "string" ? { source: obj.source } : {}),
    ...("spec" in obj ? { spec: obj.spec } : {}),
  };

  return { view, messages };
}

