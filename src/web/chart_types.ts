/**
 * Purpose: Define shared chart types used by the web renderers.
 * Intent: Keep chart implementations modular while preserving a stable API surface.
 */

import type { ValueFormat } from "../view_contract.js";

export interface ChartCardClasses {
  container: string;
  title: string;
  subtitle: string;
}

export interface ChartSeriesSpec {
  key: string;
  label?: string;
  format?: ValueFormat;
  color?: string;
  kind?: "line" | "bar";
  area?: boolean;
}

export interface ChartCardOptions {
  title: string;
  subtitle?: string;
  rows: Record<string, unknown>[];
  xField: string;
  xLabel?: string;
  xFormat?: ValueFormat;
  yField?: string;
  yLabel?: string;
  yFormat?: ValueFormat;
  series?: ChartSeriesSpec[];
  classes?: Partial<ChartCardClasses>;
}

