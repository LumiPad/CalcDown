/**
 * Purpose: Shared chart math helpers (ticks, interpolation, small utilities).
 * Intent: Keep DOM/chart rendering code readable and deterministic.
 */

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function decimalsForStep(step: number): number {
  const abs = Math.abs(step);
  if (!Number.isFinite(abs) || abs === 0) return 0;
  for (let d = 0; d <= 6; d++) {
    const scaled = abs * 10 ** d;
    if (Math.abs(scaled - Math.round(scaled)) < 1e-9) return d;
  }
  return abs < 1 ? 2 : 0;
}

function niceStep(range: number, tickCount: number): number {
  const raw = range / Math.max(1, tickCount - 1);
  if (!Number.isFinite(raw) || raw === 0) return 1;
  const exp = Math.floor(Math.log10(Math.abs(raw)));
  const base = 10 ** exp;
  const f = Math.abs(raw) / base;
  const niceF = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return niceF * base;
}

export function niceTicks(
  min: number,
  max: number,
  tickCount: number
): { min: number; max: number; step: number; ticks: number[] } {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 1, step: 1, ticks: [0, 1] };
  if (min === max) {
    const step = min === 0 ? 1 : Math.abs(min) * 0.1;
    return { min: min - step, max: max + step, step, ticks: [min - step, min, max + step] };
  }

  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  const step = niceStep(hi - lo, tickCount);
  const niceMin = Math.floor(lo / step) * step;
  const niceMax = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  // Add a tiny epsilon so we include the last tick despite float error.
  const eps = step * 1e-9;
  for (let v = niceMin; v <= niceMax + eps; v += step) ticks.push(v);
  if (ticks.length === 1) ticks.push(ticks[0]! + step);
  return { min: niceMin, max: niceMax, step, ticks };
}

export function uniqueSortedNumbers(values: number[]): number[] {
  if (values.length === 0) return [];
  const sorted = [...values].sort((a, b) => a - b);
  const out: number[] = [];
  let last: number | null = null;
  for (const v of sorted) {
    if (last === null || v !== last) out.push(v);
    last = v;
  }
  return out;
}

export function pickXTicks(xs: number[], maxTicks: number): number[] {
  if (xs.length === 0) return [];
  if (xs.length <= maxTicks) return xs;
  const out: number[] = [];
  for (let i = 0; i < maxTicks; i++) {
    const idx = Math.round((i * (xs.length - 1)) / (maxTicks - 1));
    const v = xs[idx]!;
    if (out.length === 0 || out[out.length - 1] !== v) out.push(v);
  }
  return out;
}

function pathFromPoints(points: { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0]!.x.toFixed(2)} ${points[0]!.y.toFixed(2)}`;
  return points
    .map((p, idx) => `${idx === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(" ");
}

// Monotone cubic interpolation (Fritsch–Carlson), similar to d3-shape curveMonotoneX.
export function monotoneCubicPath(points: { x: number; y: number }[]): string {
  if (points.length < 3) return pathFromPoints(points);
  for (let i = 0; i < points.length - 1; i++) {
    if (points[i + 1]!.x <= points[i]!.x) return pathFromPoints(points);
  }

  const n = points.length;
  const dx: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const p0 = points[i]!;
    const p1 = points[i + 1]!;
    const dxi = p1.x - p0.x;
    dx.push(dxi);
    m.push(dxi === 0 ? 0 : (p1.y - p0.y) / dxi);
  }

  const t: number[] = new Array(n).fill(0);
  t[0] = m[0] ?? 0;
  t[n - 1] = m[n - 2] ?? 0;
  for (let i = 1; i < n - 1; i++) {
    const m0 = m[i - 1] ?? 0;
    const m1 = m[i] ?? 0;
    if (m0 === 0 || m1 === 0 || Math.sign(m0) !== Math.sign(m1)) {
      t[i] = 0;
      continue;
    }
    const dx0 = dx[i - 1] ?? 0;
    const dx1 = dx[i] ?? 0;
    const w1 = 2 * dx1 + dx0;
    const w2 = dx1 + 2 * dx0;
    t[i] = (w1 + w2) / (w1 / m0 + w2 / m1);
  }

  const start = points[0]!;
  let d = `M ${start.x.toFixed(2)} ${start.y.toFixed(2)}`;
  for (let i = 0; i < n - 1; i++) {
    const p0 = points[i]!;
    const p1 = points[i + 1]!;
    const dxi = p1.x - p0.x;
    const c1x = p0.x + dxi / 3;
    const c1y = p0.y + (t[i] ?? 0) * (dxi / 3);
    const c2x = p1.x - dxi / 3;
    const c2y = p1.y - (t[i + 1] ?? 0) * (dxi / 3);
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)} ${c2x.toFixed(2)} ${c2y.toFixed(2)} ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`;
  }
  return d;
}

