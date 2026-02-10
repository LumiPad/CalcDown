/**
 * Purpose: Declare shared CalcDown parser and runtime TypeScript types.
 * Intent: Keep cross-module contracts explicit and stable.
 */

export type CalcdownBlockKind = "inputs" | "data" | "calc" | "view" | "unknown";

export type CalcdownSeverity = "error" | "warning";

export interface CalcdownMessage {
  severity: CalcdownSeverity;
  code?: string;
  message: string;
  file?: string;
  line?: number;
  column?: number;
  blockLang?: string;
  nodeName?: string;
}

export interface FrontMatter {
  raw: string;
  data: Record<string, string>;
}

export interface FencedCodeBlock {
  lang: string;
  info: string;
  content: string;
  fenceLine: number;
  closeFenceLine?: number;
}

export interface ParsedCalcdownMarkdown {
  frontMatter: FrontMatter | null;
  body: string;
  codeBlocks: FencedCodeBlock[];
}

export type InputValue = string | number | boolean | Date;

export interface InputType {
  name: string;
  args: string[];
  raw: string;
}

export interface InputConstraints {
  min?: number;
  max?: number;
}

export interface InputDefinition {
  name: string;
  type: InputType;
  defaultText: string;
  defaultValue: InputValue;
  constraints?: InputConstraints;
  line: number;
}

export interface InputsBlock {
  kind: "inputs";
  block: FencedCodeBlock;
  inputs: InputDefinition[];
}

export interface DataTableSource {
  uri: string;
  format: "csv" | "json";
  hash: string; // sha256:<hex>
}

export interface DataRowMapEntry {
  primaryKey: string;
  line: number; // 1-based line number in the source document
}

export interface DataTable {
  name: string;
  primaryKey: string;
  sortBy?: string;
  columns: Record<string, InputType>;
  rows: Record<string, unknown>[];
  rowMap?: DataRowMapEntry[]; // inline JSONL only
  source?: DataTableSource;
  line: number;
}

export interface DataBlock {
  kind: "data";
  block: FencedCodeBlock;
}

export interface CalcBlock {
  kind: "calc";
  block: FencedCodeBlock;
}

export interface ViewBlock {
  kind: "view";
  block: FencedCodeBlock;
}

export type CalcdownBlock = InputsBlock | DataBlock | CalcBlock | ViewBlock;
