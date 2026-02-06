/**
 * Purpose: Define core program shape used by parse and evaluation stages.
 * Intent: Keep program contracts explicit across runtime modules.
 */

import type { CalcNode } from "./calcscript/compile.js";
import type { DataTable, FencedCodeBlock, FrontMatter, InputDefinition } from "./types.js";

export interface CalcdownProgram {
  frontMatter: FrontMatter | null;
  blocks: FencedCodeBlock[];
  inputs: InputDefinition[];
  tables: DataTable[];
  nodes: CalcNode[];
}
