/**
 * Purpose: Compile CalcScript const declarations into typed calc nodes.
 * Intent: Validate expressions early and capture dependency metadata for DAG evaluation.
 */

import { CalcdownMessage } from "../types.js";
import { ArrowParam, Expr } from "./ast.js";
import { extractTopLevelConstDeclarations } from "./decl.js";
import { parseExpression } from "./parser.js";
import { CalcScriptSyntaxError } from "./tokenizer.js";

export interface CalcNode {
  name: string;
  exprText: string;
  expr?: Expr;
  dependencies: string[];
  line: number;
}

const bannedProperties = new Set(["__proto__", "prototype", "constructor"]);

function lineColFromOffset(text: string, offset: number): { line: number; column: number } {
  const clamped = Math.max(0, Math.min(offset, text.length));
  let line = 1;
  let column = 1;
  for (let i = 0; i < clamped; i++) {
    const ch = text[i];
    if (ch === "\n") {
      line++;
      column = 1;
    } else {
      column++;
    }
  }
  return { line, column };
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
    case "conditional":
      collectDependencies(expr.test, out);
      collectDependencies(expr.consequent, out);
      collectDependencies(expr.alternate, out);
      return;
    case "let": {
      const deps = new Set<string>();
      for (const b of expr.bindings) collectDependencies(b.expr, deps);
      collectDependencies(expr.body, deps);
      for (const b of expr.bindings) deps.delete(b.name);
      for (const d of deps) out.add(d);
      return;
    }
    case "member":
      collectDependencies(expr.object, out);
      return;
    case "index":
      collectDependencies(expr.object, out);
      collectDependencies(expr.index, out);
      return;
    case "call":
      collectDependencies(expr.callee, out);
      for (const a of expr.args) collectDependencies(a, out);
      return;
    case "object":
      for (const e of expr.entries) {
        if (e.kind === "spread") collectDependencies(e.expr, out);
        else collectDependencies(e.value, out);
      }
      return;
    case "arrow": {
      const deps = new Set<string>();
      collectDependencies(expr.body, deps);
      for (const p of expr.params) {
        for (const name of arrowParamBindings(p)) deps.delete(name);
      }
      for (const d of deps) out.add(d);
      return;
    }
    default: {
      const _exhaustive: never = expr;
      return _exhaustive;
    }
  }
}

function arrowParamBindings(p: ArrowParam): string[] {
  if (p.kind === "identifier") return [p.name];
  if (p.kind === "object") return p.properties.map((prop) => prop.binding);
  const _exhaustive: never = p;
  return _exhaustive;
}

function validateExpr(expr: Expr, messages: CalcdownMessage[], line: number, nodeName: string): void {
  switch (expr.kind) {
    case "number":
    case "string":
    case "boolean":
    case "identifier":
      return;
    case "unary":
      validateExpr(expr.expr, messages, line, nodeName);
      return;
    case "binary":
      validateExpr(expr.left, messages, line, nodeName);
      validateExpr(expr.right, messages, line, nodeName);
      return;
    case "conditional":
      validateExpr(expr.test, messages, line, nodeName);
      validateExpr(expr.consequent, messages, line, nodeName);
      validateExpr(expr.alternate, messages, line, nodeName);
      return;
    case "let": {
      const seen = new Set<string>();
      for (const b of expr.bindings) {
        const name = b.name;
        if (name === "std") {
          messages.push({
            severity: "error",
            code: "CD_CALC_LET_BINDING_RESERVED",
            message: "The identifier 'std' is reserved and cannot be used as a let binding name",
            line,
            nodeName,
          });
        }
        if (bannedProperties.has(name)) {
          messages.push({
            severity: "error",
            code: "CD_CALC_DISALLOWED_BINDING",
            message: `Disallowed let binding name: ${name}`,
            line,
            nodeName,
          });
        }
        if (seen.has(name)) {
          messages.push({
            severity: "error",
            code: "CD_CALC_DUPLICATE_BINDING",
            message: `Duplicate let binding name: ${name}`,
            line,
            nodeName,
          });
        }
        seen.add(name);
        validateExpr(b.expr, messages, line, nodeName);
      }
      validateExpr(expr.body, messages, line, nodeName);
      return;
    }
    case "member":
      if (bannedProperties.has(expr.property)) {
        messages.push({
          severity: "error",
          code: "CD_CALC_DISALLOWED_MEMBER",
          message: `Disallowed property access: ${expr.property}`,
          line,
          nodeName,
        });
      }
      validateExpr(expr.object, messages, line, nodeName);
      return;
    case "index":
      validateExpr(expr.object, messages, line, nodeName);
      validateExpr(expr.index, messages, line, nodeName);
      return;
    case "call":
      validateExpr(expr.callee, messages, line, nodeName);
      for (const a of expr.args) validateExpr(a, messages, line, nodeName);
      return;
    case "object":
      for (const e of expr.entries) {
        if (e.kind === "spread") {
          validateExpr(e.expr, messages, line, nodeName);
          continue;
        }
        if (bannedProperties.has(e.key)) {
          messages.push({
            severity: "error",
            code: "CD_CALC_DISALLOWED_OBJECT_KEY",
            message: `Disallowed object key: ${e.key}`,
            line,
            nodeName,
          });
        }
        validateExpr(e.value, messages, line, nodeName);
      }
      return;
    case "arrow": {
      const seen = new Set<string>();

      for (const param of expr.params) {
        if (param.kind === "identifier") {
          const p = param.name;
          if (p === "std") {
            messages.push({
              severity: "error",
              code: "CD_CALC_ARROW_PARAM_RESERVED",
              message: "The identifier 'std' is reserved and cannot be used as an arrow parameter",
              line,
              nodeName,
            });
          }
          if (bannedProperties.has(p)) {
            messages.push({
              severity: "error",
              code: "CD_CALC_DISALLOWED_PARAM",
              message: `Disallowed arrow parameter name: ${p}`,
              line,
              nodeName,
            });
          }
          if (seen.has(p)) {
            messages.push({
              severity: "error",
              code: "CD_CALC_DUPLICATE_PARAM",
              message: `Duplicate arrow parameter name: ${p}`,
              line,
              nodeName,
            });
          }
          seen.add(p);
          continue;
        }

        if (param.kind === "object") {
          for (const prop of param.properties) {
            if (bannedProperties.has(prop.key)) {
              messages.push({
                severity: "error",
                code: "CD_CALC_DISALLOWED_MEMBER",
                message: `Disallowed property access: ${prop.key}`,
                line,
                nodeName,
              });
            }

            const binding = prop.binding;
            if (binding === "std") {
              messages.push({
                severity: "error",
                code: "CD_CALC_ARROW_PARAM_RESERVED",
                message: "The identifier 'std' is reserved and cannot be used as an arrow parameter",
                line,
                nodeName,
              });
            }
            if (bannedProperties.has(binding)) {
              messages.push({
                severity: "error",
                code: "CD_CALC_DISALLOWED_PARAM",
                message: `Disallowed arrow parameter name: ${binding}`,
                line,
                nodeName,
              });
            }
            if (seen.has(binding)) {
              messages.push({
                severity: "error",
                code: "CD_CALC_DUPLICATE_PARAM",
                message: `Duplicate arrow parameter name: ${binding}`,
                line,
                nodeName,
              });
            }
            seen.add(binding);
          }
          continue;
        }

        const _exhaustive: never = param;
        return _exhaustive;
      }

      validateExpr(expr.body, messages, line, nodeName);
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
        code: "CD_CALC_DUPLICATE_NODE",
        message: `Duplicate node name: ${decl.name}`,
        line: decl.line,
        nodeName: decl.name,
      });
      continue;
    }
    seen.add(decl.name);

    try {
      const expr = parseExpression(decl.exprText);
      validateExpr(expr, messages, decl.line, decl.name);
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
      let line = decl.line;
      let column: number | undefined = undefined;

      if (err instanceof CalcScriptSyntaxError) {
        const rawOffset = decl.exprTrimStartOffset + err.pos;
        const { line: relLine, column: relCol } = lineColFromOffset(decl.exprTextRaw, rawOffset);
        line = decl.exprStartLine + (relLine - 1);
        column = relLine === 1 ? decl.exprStartColumn + (relCol - 1) : relCol;
      }

      messages.push({
        severity: "error",
        code: "CD_CALC_PARSE_EXPR",
        message: err instanceof Error ? err.message : String(err),
        line,
        ...(column !== undefined ? { column } : {}),
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
