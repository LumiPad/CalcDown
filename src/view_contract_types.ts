/**
 * Purpose: Define CalcDown view contract types shared by validation and rendering.
 * Intent: Keep view schema contracts explicit and reusable across modules.
 */

export type CalcdownViewType = "cards" | "table" | "chart" | "layout";

export type ViewVisibility = boolean | string;

export type ValueFormat =
  | "number"
  | "integer"
  | "percent"
  | "percent01"
  | "currency"
  | "date"
  | {
      kind: "number" | "integer" | "percent" | "currency" | "date";
      digits?: number;
      currency?: string;
      scale?: number;
    };

export interface CardsCompareSpec {
  key: string;
  label: string;
  format?: ValueFormat;
}

export interface CardsMetricItem {
  key: string;
  label: string;
  format?: ValueFormat;
  compare?: CardsCompareSpec;
}

export interface CardsSparklineItem {
  type: "sparkline";
  source: string;
  key: string;
  label: string;
  kind: "line";
}

export type CardsViewSpecItem = CardsMetricItem | CardsSparklineItem;

export interface CalcdownCardsView {
  id: string;
  type: "cards";
  library: "calcdown";
  visible?: ViewVisibility;
  spec: {
    title?: string;
    items: CardsViewSpecItem[];
  };
  line: number;
}

export interface TableDataBarSpec {
  color?: string;
  max?: number | "auto";
}

export interface TableViewColumn {
  key: string;
  label: string;
  format?: ValueFormat;
  dataBar?: TableDataBarSpec;
  conditionalFormat?: ConditionalFormatRule[];
}

export type ConditionalFormatPresetStyle = "positive" | "negative" | "neutral" | "warning" | "highlight";

export interface ConditionalFormatStyleObject {
  color?: string;
  backgroundColor?: string;
  fontWeight?: string;
}

export type ConditionalFormatStyle = ConditionalFormatPresetStyle | ConditionalFormatStyleObject;

export interface ConditionalFormatRule {
  when: string;
  style: ConditionalFormatStyle;
}

export interface CalcdownTableView {
  id: string;
  type: "table";
  library: "calcdown";
  source: string;
  visible?: ViewVisibility;
  spec: {
    title?: string;
    columns?: TableViewColumn[];
    editable: boolean;
    limit?: number;
  };
  line: number;
}

export interface ChartAxisSpec {
  key: string;
  label: string;
  format?: ValueFormat;
  kind?: "line" | "bar";
  area?: boolean;
}

export interface CalcdownChartView {
  id: string;
  type: "chart";
  library: "calcdown";
  source: string;
  visible?: ViewVisibility;
  spec: {
    title?: string;
    kind: "line" | "bar" | "combo";
    x: ChartAxisSpec;
    y: ChartAxisSpec | ChartAxisSpec[];
  };
  line: number;
}

export type LayoutItem = { kind: "ref"; ref: string } | { kind: "layout"; spec: LayoutSpec };

export interface LayoutSpec {
  title?: string;
  direction: "row" | "column";
  items: LayoutItem[];
}

export interface CalcdownLayoutView {
  id: string;
  type: "layout";
  library: "calcdown";
  visible?: ViewVisibility;
  spec: LayoutSpec;
  line: number;
}

export type CalcdownView = CalcdownCardsView | CalcdownTableView | CalcdownChartView | CalcdownLayoutView;
