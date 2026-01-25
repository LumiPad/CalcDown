const STYLE_ID = "calcdown-styles";

export const CALCDOWN_BASE_CSS = `
.calcdown-root {
  font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
  color: #111428;
}

.calcdown-root .muted {
  color: #6a718a;
  font-size: 12px;
}

.calcdown-root .view {
  border: 1px solid #e8eaf2;
  border-radius: 12px;
  background: #fbfcff;
  padding: 12px;
}

.calcdown-root .view-title {
  font-size: 12px;
  color: #6a718a;
  margin: 0 0 10px 0;
}

.calcdown-root .cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 10px;
}

.calcdown-root .card {
  border: 1px solid #e8eaf2;
  border-radius: 12px;
  padding: 12px;
  background: #fff;
}

.calcdown-root .card .k {
  font-size: 12px;
  color: #6a718a;
  margin-bottom: 6px;
}

.calcdown-root .card .v {
  font-size: 22px;
  font-weight: 650;
  color: #111428;
}

.calcdown-root table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: 12px;
}

.calcdown-root th,
.calcdown-root td {
  border-bottom: 1px solid #e8eaf2;
  padding: 8px 10px;
  text-align: left;
  vertical-align: top;
}

.calcdown-root th {
  color: #6a718a;
  font-weight: 600;
  background: #f6f7fb;
  position: sticky;
  top: 0;
}

.calcdown-root td input {
  width: 100%;
  box-sizing: border-box;
  padding: 6px 8px;
  border: 1px solid #d9dbe5;
  border-radius: 8px;
  font-size: 12px;
  background: #fff;
}

.calcdown-root .calcdown-messages {
  margin-top: 10px;
  white-space: pre-wrap;
  word-break: break-word;
  background: #0b1020;
  color: #e7ebff;
  padding: 12px;
  border-radius: 10px;
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

