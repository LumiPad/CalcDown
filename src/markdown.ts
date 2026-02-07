/**
 * Purpose: Parse front matter and fenced blocks from CalcDown markdown.
 * Intent: Provide stable block extraction for downstream parsers and editors.
 */

import { FrontMatter, FencedCodeBlock, ParsedCalcdownMarkdown } from "./types.js";

const CALCDOWN_BLOCK_KINDS = new Set(["inputs", "data", "calc", "view"]);

export function isCalcdownFenceMarkerInfo(info: string): boolean {
  const tokens = info.trim().split(/\s+/).filter(Boolean);
  const first = (tokens[0] ?? "").trim();
  if (!first) return false;
  const firstLower = first.toLowerCase();
  if (firstLower === "calcdown") return true;
  const colonIdx = firstLower.indexOf(":");
  if (colonIdx !== -1 && firstLower.slice(0, colonIdx) === "calcdown") return true;
  return false;
}

function normalizeFenceLang(info: string): string {
  const tokens = info.trim().split(/\s+/).filter(Boolean);
  const first = tokens[0] ?? "";
  if (!first) return "";

  const firstLower = first.toLowerCase();
  if (CALCDOWN_BLOCK_KINDS.has(firstLower)) return firstLower;

  // Explicit CalcDown marker forms:
  //   ``` calcdown view
  //   ``` calcdown:view
  if (firstLower === "calcdown") {
    const kindLower = (tokens[1] ?? "").toLowerCase();
    if (CALCDOWN_BLOCK_KINDS.has(kindLower)) return kindLower;
    return "calcdown";
  }

  const colonIdx = first.indexOf(":");
  if (colonIdx !== -1) {
    const prefix = first.slice(0, colonIdx).toLowerCase();
    if (prefix === "calcdown") {
      const kindLower = first.slice(colonIdx + 1).toLowerCase();
      if (CALCDOWN_BLOCK_KINDS.has(kindLower)) return kindLower;
      return "calcdown";
    }
  }

  return first;
}

export function hasCalcdownFenceMarkers(markdown: string): boolean {
  const parsed = parseCalcdownMarkdown(markdown);
  return parsed.codeBlocks.some((b) => isCalcdownFenceMarkerInfo(b.info));
}

function parseSimpleYaml(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf(":");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (!key) continue;
    out[key] = value;
  }
  return out;
}

export function extractFrontMatter(markdown: string): {
  frontMatter: FrontMatter | null;
  body: string;
  bodyStartLine: number;
} {
  const lines = markdown.split(/\r?\n/);
  if (lines.length === 0 || lines[0] !== "---") {
    return { frontMatter: null, body: markdown, bodyStartLine: 1 };
  }

  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === "---") {
      end = i;
      break;
    }
  }
  if (end === -1) {
    return { frontMatter: null, body: markdown, bodyStartLine: 1 };
  }

  const raw = lines.slice(1, end).join("\n");
  const body = lines.slice(end + 1).join("\n");
  return {
    frontMatter: { raw, data: parseSimpleYaml(raw) },
    body,
    bodyStartLine: end + 2,
  };
}

function isClosingFenceLine(line: string, fence: string): boolean {
  const trimmedLeft = line.trimStart();
  if (!trimmedLeft) return false;
  const fenceChar = fence[0];
  if (!fenceChar) return false;
  if (trimmedLeft[0] !== fenceChar) return false;

  let count = 0;
  while (count < trimmedLeft.length && trimmedLeft[count] === fenceChar) count++;
  if (count < fence.length) return false;

  for (let i = count; i < trimmedLeft.length; i++) {
    const ch = trimmedLeft[i];
    if (ch !== " " && ch !== "\t") return false;
  }
  return true;
}

export function extractFencedCodeBlocks(markdownBody: string, baseLine: number): FencedCodeBlock[] {
  const lines = markdownBody.split(/\r?\n/);
  const blocks: FencedCodeBlock[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    const open = line.match(/^(\s*)(`{3,}|~{3,})(.*)$/);
    if (!open) continue;

    const fence = open[2];
    if (!fence) continue;
    const info = (open[3] ?? "").trim();
    const lang = normalizeFenceLang(info);
    const fenceLine = baseLine + i;

    const contentLines: string[] = [];
    let closeFenceLine: number | undefined;

    for (i = i + 1; i < lines.length; i++) {
      const l = lines[i];
      if (l === undefined) break;
      if (isClosingFenceLine(l, fence)) {
        closeFenceLine = baseLine + i;
        break;
      }
      contentLines.push(l);
    }

    const block: FencedCodeBlock = {
      lang,
      info,
      content: contentLines.join("\n"),
      fenceLine,
      ...(closeFenceLine !== undefined ? { closeFenceLine } : {}),
    };
    blocks.push(block);
  }

  return blocks;
}

export function parseCalcdownMarkdown(markdown: string): ParsedCalcdownMarkdown {
  const { frontMatter, body, bodyStartLine } = extractFrontMatter(markdown);
  const codeBlocks = extractFencedCodeBlocks(body, bodyStartLine);
  return { frontMatter, body, codeBlocks };
}
