function isHrLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (t.length < 3) return false;
  if (!/^[\-\*_]+$/.test(t)) return false;
  const ch = t[0]!;
  if (ch !== "-" && ch !== "*" && ch !== "_") return false;
  let count = 0;
  for (const c of t) if (c === ch) count++;
  return count >= 3;
}

function isEscaped(src: string, index: number): boolean {
  // Markdown-style escaping: a character is escaped if preceded by an odd number of backslashes.
  let slashes = 0;
  for (let i = index - 1; i >= 0 && src[i] === "\\"; i--) slashes++;
  return slashes % 2 === 1;
}

function stripHtmlCommentsPreserveNewlinesAndCodeSpans(markdown: string): string {
  let out = "";
  let inComment = false;

  for (let i = 0; i < markdown.length; i++) {
    if (inComment) {
      if (markdown.startsWith("-->", i)) {
        inComment = false;
        i += 2;
        continue;
      }
      const ch = markdown[i]!;
      if (ch === "\n" || ch === "\r") out += ch;
      continue;
    }

    if (markdown.startsWith("<!--", i) && !isEscaped(markdown, i)) {
      inComment = true;
      i += 3;
      continue;
    }

    const ch = markdown[i]!;
    if (ch === "`" && !isEscaped(markdown, i)) {
      // Preserve inline code spans verbatim so we don't strip comment-like text inside them.
      const lineEnd = markdown.indexOf("\n", i + 1);
      const searchEnd = lineEnd === -1 ? markdown.length : lineEnd;
      const close = markdown.indexOf("`", i + 1);
      if (close !== -1 && close < searchEnd) {
        out += markdown.slice(i, close + 1);
        i = close;
        continue;
      }
    }

    out += ch;
  }

  return out;
}

export function stripNarrativeComments(markdown: string): string {
  const strippedHtml = stripHtmlCommentsPreserveNewlinesAndCodeSpans(markdown);
  const originalLines = markdown.split(/\r?\n/);
  const strippedLines = strippedHtml.split(/\r?\n/);

  const out: string[] = [];
  const n = Math.max(originalLines.length, strippedLines.length);
  for (let i = 0; i < n; i++) {
    const original = originalLines[i] ?? "";
    const stripped = strippedLines[i] ?? "";

    const trimmedStart = stripped.trimStart();
    if (trimmedStart.startsWith("%%")) continue;

    if (!trimmedStart.trim()) {
      // Keep genuine blank lines, but drop lines that became blank after stripping HTML comments.
      if (!original.trim()) out.push("");
      continue;
    }

    out.push(stripped);
  }

  return out.join("\n");
}

function nextSpecialIndex(text: string, start: number): number {
  for (let i = start; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === "\\" || ch === "`" || ch === "*" || ch === "[") return i;
  }
  return -1;
}

function appendText(parent: HTMLElement, text: string): void {
  if (!text) return;
  parent.appendChild(document.createTextNode(text));
}

function sanitizeHref(href: string): string | null {
  const raw = href.trim();
  if (!raw) return null;

  // Collapse whitespace/control characters to prevent scheme obfuscation like "java\nscript:".
  const cleaned = raw.replace(/[\u0000-\u001F\u007F\s]+/g, "");
  if (!cleaned) return null;

  if (cleaned.startsWith("#")) return cleaned;
  if (cleaned.startsWith("/")) return cleaned;
  if (cleaned.startsWith("./") || cleaned.startsWith("../")) return cleaned;

  const scheme = cleaned.match(/^([A-Za-z][A-Za-z0-9+.-]*):/)?.[1]?.toLowerCase() ?? "";
  if (scheme) {
    if (scheme === "http" || scheme === "https" || scheme === "mailto" || scheme === "tel") return cleaned;
    return null;
  }

  // Relative URL.
  return cleaned;
}

function appendInlines(parent: HTMLElement, src: string): void {
  let i = 0;
  while (i < src.length) {
    const ch = src[i]!;

    if (ch === "\\") {
      const next = src[i + 1];
      if (next !== undefined) appendText(parent, next);
      i += next === undefined ? 1 : 2;
      continue;
    }

    if (ch === "`") {
      const close = src.indexOf("`", i + 1);
      if (close !== -1) {
        const code = document.createElement("code");
        code.textContent = src.slice(i + 1, close);
        parent.appendChild(code);
        i = close + 1;
        continue;
      }
    }

    if (src.startsWith("**", i)) {
      const close = src.indexOf("**", i + 2);
      if (close !== -1) {
        const strong = document.createElement("strong");
        appendInlines(strong, src.slice(i + 2, close));
        parent.appendChild(strong);
        i = close + 2;
        continue;
      }
    }

    if (ch === "*") {
      const close = src.indexOf("*", i + 1);
      if (close !== -1) {
        const em = document.createElement("em");
        appendInlines(em, src.slice(i + 1, close));
        parent.appendChild(em);
        i = close + 1;
        continue;
      }
    }

    if (ch === "[") {
      const closeText = src.indexOf("]", i + 1);
      if (closeText !== -1 && src[closeText + 1] === "(") {
        const closeHref = src.indexOf(")", closeText + 2);
        if (closeHref !== -1) {
          const label = src.slice(i + 1, closeText);
          const hrefRaw = src.slice(closeText + 2, closeHref).trim();
          const href = sanitizeHref(hrefRaw);

          if (href) {
            const a = document.createElement("a");
            a.href = href;
            a.rel = "noopener noreferrer";
            a.target = "_blank";
            appendInlines(a, label);
            parent.appendChild(a);
          } else {
            // Render disallowed links as plain text to avoid executable schemes (javascript:, data:, etc.).
            const span = document.createElement("span");
            appendInlines(span, label);
            parent.appendChild(span);
            if (hrefRaw) {
              parent.appendChild(document.createTextNode(" "));
              const code = document.createElement("code");
              code.textContent = hrefRaw;
              parent.appendChild(code);
            }
          }

          i = closeHref + 1;
          continue;
        }
      }
    }

    const next = nextSpecialIndex(src, i + 1);
    if (next === -1) {
      appendText(parent, src.slice(i));
      break;
    }
    appendText(parent, src.slice(i, next));
    i = next;
  }
}

function lineIsListItem(t: string): { kind: "ul" | "ol"; text: string } | null {
  const mUl = t.match(/^[-*+]\s+(.+)$/);
  if (mUl) return { kind: "ul", text: mUl[1] ?? "" };
  const mOl = t.match(/^[0-9]+\.\s+(.+)$/);
  if (mOl) return { kind: "ol", text: mOl[1] ?? "" };
  return null;
}

export function renderMarkdownText(container: HTMLElement, markdown: string): void {
  const cleaned = stripNarrativeComments(markdown);
  const lines = cleaned.split(/\r?\n/);
  let i = 0;

  while (i < lines.length) {
    const raw = lines[i] ?? "";
    const trimmed = raw.trimEnd();
    const t = trimmed.trim();

    if (!t) {
      i++;
      continue;
    }

    if (isHrLine(trimmed)) {
      container.appendChild(document.createElement("hr"));
      i++;
      continue;
    }

    const heading = t.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = Math.max(1, Math.min(6, heading[1]!.length));
      const text = heading[2] ?? "";
      const h = document.createElement(`h${level}`) as HTMLHeadingElement;
      appendInlines(h, text);
      container.appendChild(h);
      i++;
      continue;
    }

    const listItem = lineIsListItem(t);
    if (listItem) {
      const list = document.createElement(listItem.kind === "ul" ? "ul" : "ol");
      while (i < lines.length) {
        const lt = (lines[i] ?? "").trimEnd().trim();
        const it = lineIsListItem(lt);
        if (!it || it.kind !== listItem.kind) break;
        const li = document.createElement("li");
        appendInlines(li, it.text);
        list.appendChild(li);
        i++;
      }
      container.appendChild(list);
      continue;
    }

    // Paragraph: collect consecutive non-blank lines until a new block starts.
    const paraLines: string[] = [];
    while (i < lines.length) {
      const lraw = lines[i] ?? "";
      const ltrimmed = lraw.trimEnd();
      const lt = ltrimmed.trim();
      if (!lt) break;
      if (isHrLine(ltrimmed)) break;
      if (/^(#{1,6})\s+/.test(lt)) break;
      if (lineIsListItem(lt)) break;
      paraLines.push(lt);
      i++;
    }
    const p = document.createElement("p");
    appendInlines(p, paraLines.join(" "));
    container.appendChild(p);
  }
}
