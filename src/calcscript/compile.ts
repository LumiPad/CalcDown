import { CalcdownMessage } from "../types.js";
import { Expr } from "./ast.js";
import { extractTopLevelConstDeclarations } from "./decl.js";
import { parseExpression } from "./parser.js";

export interface CalcNode {
  name: string;
  exprText: string;
  expr?: Expr;
  dependencies: string[];
  line: number;
}

function collectDependencies(expr: Expr, out: Set<string>): void {
  switch (expr.kind) {
    case "identifier":
      out.add(expr.name);
      return;
    case "number":
    case "string":
    case "boolean":
      return;
    case "unary":
      collectDependencies(expr.expr, out);
      return;
    case "binary":
      collectDependencies(expr.left, out);
      collectDependencies(expr.right, out);
      return;
    case "member":
      collectDependencies(expr.object, out);
      return;
    case "call":
      collectDependencies(expr.callee, out);
      for (const a of expr.args) collectDependencies(a, out);
      return;
    case "object":
      for (const p of expr.properties) collectDependencies(p.value, out);
      return;
    case "arrow": {
      const deps = new Set<string>();
      collectDependencies(expr.body, deps);
      for (const p of expr.params) deps.delete(p);
      for (const d of deps) out.add(d);
      return;
    }
    default: {
      const _exhaustive: never = expr;
      return _exhaustive;
    }
  }
}

export function compileCalcScript(source: string, baseLine: number): {
  nodes: CalcNode[];
  messages: CalcdownMessage[];
} {
  const messages: CalcdownMessage[] = [];
  const { decls, messages: declMessages } = extractTopLevelConstDeclarations(source, baseLine);
  messages.push(...declMessages);

  const nodes: CalcNode[] = [];
  const seen = new Set<string>();

  for (const decl of decls) {
    if (seen.has(decl.name)) {
      messages.push({
        severity: "error",
        message: `Duplicate node name: ${decl.name}`,
        line: decl.line,
        nodeName: decl.name,
      });
      continue;
    }
    seen.add(decl.name);

    try {
      const expr = parseExpression(decl.exprText);
      const deps = new Set<string>();
      collectDependencies(expr, deps);
      deps.delete("std");
      nodes.push({
        name: decl.name,
        exprText: decl.exprText,
        expr,
        dependencies: [...deps].sort(),
        line: decl.line,
      });
    } catch (err) {
      messages.push({
        severity: "error",
        message: err instanceof Error ? err.message : String(err),
        line: decl.line,
        nodeName: decl.name,
      });
      nodes.push({
        name: decl.name,
        exprText: decl.exprText,
        dependencies: [],
        line: decl.line,
      });
    }
  }

  return { nodes, messages };
}
