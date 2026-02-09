/**
 * Purpose: Render a compact bottom legend for CalcDown charts.
 * Intent: Keep legend layout consistent across chart implementations.
 */

export function appendChartLegend(
  view: HTMLElement,
  entries: { label: string; color: string }[]
): void {
  if (entries.length <= 1) return;

  const legend = document.createElement("div");
  legend.className = "chart-legend";
  legend.style.display = "flex";
  legend.style.flexWrap = "wrap";
  legend.style.justifyContent = "center";
  legend.style.alignItems = "center";
  legend.style.gap = "8px 14px";
  legend.style.marginTop = "8px";
  legend.style.fontSize = "12px";
  legend.style.color = "var(--calcdown-muted, #6a718a)";

  for (const entry of entries) {
    const item = document.createElement("div");
    item.className = "chart-legend-item";
    item.style.display = "inline-flex";
    item.style.alignItems = "center";
    item.style.gap = "8px";

    const swatch = document.createElement("span");
    swatch.className = "chart-legend-swatch";
    swatch.style.background = entry.color;
    swatch.style.width = "10px";
    swatch.style.height = "10px";
    swatch.style.borderRadius = "3px";
    swatch.style.display = "inline-block";
    swatch.style.flex = "0 0 auto";

    const text = document.createElement("span");
    text.className = "chart-legend-label";
    text.textContent = entry.label;

    item.appendChild(swatch);
    item.appendChild(text);
    legend.appendChild(item);
  }

  view.appendChild(legend);
}

