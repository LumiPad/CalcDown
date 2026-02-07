/**
 * Purpose: Install default CSS styles for CalcDown web components.
 * Intent: Keep demo and embed styling consistent with minimal setup.
 */

const STYLE_ID = "calcdown-styles";

export const CALCDOWN_BASE_CSS = `
.calcdown-root {
  --calcdown-font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
  --calcdown-text: #111428;
  --calcdown-muted: #6a718a;
  --calcdown-label: #333;
  --calcdown-surface: #fff;
  --calcdown-view-bg: #fbfcff;
  --calcdown-border: #e8eaf2;
  --calcdown-border-strong: #d9dbe5;
  --calcdown-code-inline-bg: #f6f7fb;
  --calcdown-messages-bg: #0b1020;
  --calcdown-messages-text: #e7ebff;
  --calcdown-radius: 12px;
  --calcdown-radius-md: 10px;
  --calcdown-radius-sm: 8px;
  --calcdown-radius-xs: 6px;
  --calcdown-doc-max-width: 980px;

  font-family: var(--calcdown-font-family);
  color: var(--calcdown-text);
}

.calcdown-root .muted {
  color: var(--calcdown-muted);
  font-size: 12px;
}

.calcdown-root .view {
  border: 1px solid var(--calcdown-border);
  border-radius: var(--calcdown-radius);
  background: var(--calcdown-view-bg);
  padding: 12px;
}

.calcdown-root .view-title {
  font-size: 12px;
  color: var(--calcdown-muted);
  margin: 0 0 10px 0;
}

.calcdown-root .calcdown-doc {
  display: grid;
  gap: 12px;
  width: 100%;
  max-width: min(100%, var(--calcdown-doc-max-width));
  margin: 0 auto;
}

.calcdown-root .calcdown-md {
  line-height: 1.55;
}

.calcdown-root .calcdown-md h1,
.calcdown-root .calcdown-md h2,
.calcdown-root .calcdown-md h3,
.calcdown-root .calcdown-md h4,
.calcdown-root .calcdown-md h5,
.calcdown-root .calcdown-md h6 {
  margin: 14px 0 8px 0;
}

.calcdown-root .calcdown-md p {
  margin: 0 0 12px 0;
}

.calcdown-root .calcdown-md ul,
.calcdown-root .calcdown-md ol {
  margin: 0 0 12px 20px;
  padding: 0;
}

.calcdown-root .calcdown-md hr {
  border: 0;
  border-top: 1px solid var(--calcdown-border);
  margin: 16px 0;
}

.calcdown-root .calcdown-md code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 0.95em;
  background: var(--calcdown-code-inline-bg);
  border: 1px solid var(--calcdown-border);
  border-radius: var(--calcdown-radius-xs);
  padding: 1px 5px;
}

.calcdown-root .calcdown-inputs {
  display: grid;
  gap: 10px;
}

.calcdown-root .calcdown-inputs .field {
  display: grid;
  gap: 6px;
}

.calcdown-root .calcdown-inputs .field label {
  font-size: 12px;
  color: var(--calcdown-label);
}

.calcdown-root .calcdown-inputs .field input {
  padding: 8px 10px;
  border: 1px solid var(--calcdown-border-strong);
  border-radius: var(--calcdown-radius-md);
  font-size: 14px;
  background: var(--calcdown-surface);
  width: 100%;
  box-sizing: border-box;
}

.calcdown-root .calcdown-code {
  border: 1px dashed var(--calcdown-border-strong);
  border-radius: var(--calcdown-radius);
  padding: 10px 12px;
  background: var(--calcdown-surface);
}

.calcdown-root .calcdown-code-title {
  font-size: 12px;
  color: var(--calcdown-muted);
  margin: 0 0 8px 0;
}

.calcdown-root .calcdown-code pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 12px;
  line-height: 1.4;
}

.calcdown-root .cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 320px));
  justify-content: start;
  gap: 10px;
}

.calcdown-root .card {
  border: 1px solid var(--calcdown-border);
  border-radius: var(--calcdown-radius);
  padding: 12px;
  background: var(--calcdown-surface);
}

.calcdown-root .card .k {
  font-size: 12px;
  color: var(--calcdown-muted);
  margin-bottom: 6px;
}

.calcdown-root .card .v {
  font-size: 22px;
  font-weight: 650;
  color: var(--calcdown-text);
}

.calcdown-root table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: 12px;
}

.calcdown-root th,
.calcdown-root td {
  border-bottom: 1px solid var(--calcdown-border);
  padding: 8px 10px;
  text-align: left;
  vertical-align: top;
}

.calcdown-root th {
  color: var(--calcdown-muted);
  font-weight: 600;
  background: var(--calcdown-code-inline-bg);
  position: sticky;
  top: 0;
}

.calcdown-root td input {
  width: 100%;
  box-sizing: border-box;
  padding: 6px 8px;
  border: 1px solid var(--calcdown-border-strong);
  border-radius: var(--calcdown-radius-sm);
  font-size: 12px;
  background: var(--calcdown-surface);
}

.calcdown-root .calcdown-messages {
  margin-top: 10px;
  white-space: pre-wrap;
  word-break: break-word;
  background: var(--calcdown-messages-bg);
  color: var(--calcdown-messages-text);
  padding: 12px;
  border-radius: var(--calcdown-radius-md);
  font-size: 12px;
}
`.trim();

export function installCalcdownStyles(doc: Document = document): void {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CALCDOWN_BASE_CSS;
  (doc.head ?? doc.documentElement).appendChild(style);
}
