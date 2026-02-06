/**
 * Purpose: Parse front matter and fenced blocks from CalcDown markdown.
 * Intent: Provide stable block extraction for downstream parsers and editors.
 */

import { FrontMatter, FencedCodeBlock, ParsedCalcdownMarkdown } from "./types.js";

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
    const lang = info.split(/\s+/)[0] ?? "";
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
