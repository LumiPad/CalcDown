/**
 * Purpose: Evaluate CalcScript expressions and calc-node DAGs safely.
 * Intent: Enforce deterministic sandboxed execution with clear model errors.
 */

import { CalcdownMessage } from "../types.js";
import type { Expr } from "./ast.js";
import {
  assertBoolean,
  compareScalars,
  evalConcat,
  evalNumericBinary,
  evalUnaryMinus,
  strictEquals,
} from "./eval_ops.js";
import {
  collectStdFunctions,
  type EvalContext,
  isBannedProperty,
  isNodeError,
  makeNodeError,
  nodeErrorInfo,
  safeGet,
} from "./eval_runtime.js";
import { isStdMemberPath } from "./parser.js";

export interface EvalResult {
  values: Record<string, unknown>;
  messages: CalcdownMessage[];
  env: Record<string, unknown>;
}

function evalExpr(expr: Expr, env: Record<string, unknown>, ctx: EvalContext): unknown {
  switch (expr.kind) {
    case "number":
    case "string":
    case "boolean":
      return expr.value;
    case "identifier": {
      if (expr.name in env) {
        const v = env[expr.name];
        if (isNodeError(v)) {
          const info = nodeErrorInfo(v);
          throw new Error(`Upstream error in '${info.nodeName}': ${info.message}`);
        }
        return v;
      }
      throw new Error(`Unknown identifier: ${expr.name}`);
    }
    case "unary": {
      const v = evalExpr(expr.expr, env, ctx);
      if (expr.op === "-") return evalUnaryMinus(v, "Unary '-'");
      if (expr.op === "!") return !assertBoolean(v, "Unary '!'");
      throw new Error("Unsupported unary op");
    }
    case "binary": {
      if (expr.op === "&&") {
        const a = assertBoolean(evalExpr(expr.left, env, ctx), "Binary '&&'");
        if (!a) return false;
        return assertBoolean(evalExpr(expr.right, env, ctx), "Binary '&&'");
      }
      if (expr.op === "||") {
        const a = assertBoolean(evalExpr(expr.left, env, ctx), "Binary '||'");
        if (a) return true;
        return assertBoolean(evalExpr(expr.right, env, ctx), "Binary '||'");
      }
      if (expr.op === "??") {
        const a = evalExpr(expr.left, env, ctx);
        if (a !== null && a !== undefined) return a;
        return evalExpr(expr.right, env, ctx);
      }

      const a = evalExpr(expr.left, env, ctx);
      const b = evalExpr(expr.right, env, ctx);
      switch (expr.op) {
        case "&":
          return evalConcat(a, b, "Binary '&'");
        case "+":
          return evalNumericBinary("+", a, b, (x, y) => x + y);
        case "-":
          return evalNumericBinary("-", a, b, (x, y) => x - y);
        case "*":
          return evalNumericBinary("*", a, b, (x, y) => x * y);
        case "/":
          return evalNumericBinary("/", a, b, (x, y) => {
            if (y === 0) throw new Error("Division by zero");
            return x / y;
          });
        case "**":
          return evalNumericBinary("**", a, b, (x, y) => x ** y);
        case "<":
        case "<=":
        case ">":
        case ">=":
          return compareScalars(expr.op, a, b);
        case "==":
          return strictEquals(a, b);
        case "!=":
          return !strictEquals(a, b);
        default:
          throw new Error("Unsupported binary op");
      }
    }
    case "conditional": {
      const test = assertBoolean(evalExpr(expr.test, env, ctx), "Conditional test");
      return test ? evalExpr(expr.consequent, env, ctx) : evalExpr(expr.alternate, env, ctx);
    }
    case "let": {
      const child: Record<string, unknown> = Object.create(env);
      for (const b of expr.bindings) {
        const name = b.name;
        if (name === "std") throw new Error("The identifier 'std' is reserved and cannot be used as a let binding name");
        if (isBannedProperty(name)) throw new Error(`Disallowed let binding name: ${name}`);
        child[name] = evalExpr(b.expr, child, ctx);
      }
      return evalExpr(expr.body, child, ctx);
    }
    case "member": {
      const obj = evalExpr(expr.object, env, ctx);
      const prop = expr.property;
      if (Array.isArray(obj)) {
        if (Object.prototype.hasOwnProperty.call(obj, prop)) return safeGet(obj, prop);
        if (prop in Array.prototype) {
          throw new Error(`Unknown property: ${prop}`);
        }
        const pkKey = ctx.tablePkByArray.get(obj)?.primaryKey ?? null;
        const out = new Array<unknown>(obj.length);
        for (let i = 0; i < obj.length; i++) {
          try {
            out[i] = safeGet(obj[i], prop);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            const row = obj[i];
            let rowLabel = `Row ${i}`;
            if (pkKey && row && typeof row === "object" && !Array.isArray(row) && Object.prototype.hasOwnProperty.call(row, pkKey)) {
              const pkRaw = (row as Record<string, unknown>)[pkKey];
              const pk = typeof pkRaw === "string" ? pkRaw : typeof pkRaw === "number" && Number.isFinite(pkRaw) ? String(pkRaw) : null;
              if (pk) rowLabel = `Row (${pkKey} = ${JSON.stringify(pk)})`;
            }
            throw new Error(`${rowLabel}: ${msg}`);
          }
        }
        return out;
      }
      return safeGet(obj, prop);
    }
    case "index": {
      const obj = evalExpr(expr.object, env, ctx);
      const idx = evalExpr(expr.index, env, ctx);
      if (!Array.isArray(obj)) throw new Error("Indexing requires an array");
      if (typeof idx !== "number" || !Number.isFinite(idx) || !Number.isInteger(idx) || idx < 0) {
        throw new Error("Index must be a non-negative integer");
      }
      if (idx >= obj.length) throw new Error("Index out of bounds");
      const key = String(idx);
      if (!Object.prototype.hasOwnProperty.call(obj, key)) throw new Error("Missing array element");
      return obj[idx];
    }
    case "call": {
      if (!isStdMemberPath(expr.callee)) {
        throw new Error("Only std.* function calls are supported in this evaluator");
      }
      const fn = evalExpr(expr.callee, env, ctx);
      if (typeof fn !== "function") throw new Error("Callee is not a function");
      if (!ctx.stdFunctions.has(fn)) throw new Error("Only std library functions may be called");
      const args = expr.args.map((a) => evalExpr(a, env, ctx));
      return fn(...args);
    }
    case "object": {
      const out: Record<string, unknown> = Object.create(null);
      for (const e of expr.entries) {
        if (e.kind === "spread") {
          const src = evalExpr(e.expr, env, ctx);
          if (!src || typeof src !== "object" || Array.isArray(src)) {
            throw new Error("Object spread requires an object");
          }
          for (const k of Object.keys(src as Record<string, unknown>)) {
            if (isBannedProperty(k)) throw new Error(`Disallowed object key: ${k}`);
            out[k] = (src as Record<string, unknown>)[k];
          }
          continue;
        }

        if (isBannedProperty(e.key)) throw new Error(`Disallowed object key: ${e.key}`);
        out[e.key] = evalExpr(e.value, env, ctx);
      }
      return out;
    }
    case "arrow": {
      const captured = env;
      const params = expr.params.slice();
      const body = expr.body;
      return (...args: unknown[]) => {
        const child: Record<string, unknown> = Object.create(captured);
        for (let i = 0; i < params.length; i++) {
          const param = params[i];
          if (param === undefined) throw new Error("Invalid arrow function parameter");

          const bind = (name: string, value: unknown): void => {
            if (name === "std") throw new Error("The identifier 'std' is reserved and cannot be used as an arrow parameter");
            child[name] = value;
          };

          if (param.kind === "identifier") {
            bind(param.name, args[i]);
            continue;
          }
          if (param.kind === "object") {
            const src = args[i];
            if (!src || typeof src !== "object" || Array.isArray(src)) {
              throw new Error("Object destructuring requires an object argument");
            }
            for (const p of param.properties) {
              bind(p.binding, safeGet(src, p.key));
            }
            continue;
          }
          const _exhaustive: never = param;
          return _exhaustive;
        }
        return evalExpr(body, child, ctx);
      };
    }
    default: {
      const _exhaustive: never = expr;
      return _exhaustive;
    }
  }
}

export function calcErrorCodeForMessage(message: string): string {
  if (message === "Division by zero" || message.startsWith("Division by zero")) return "CD_CALC_DIV_ZERO";
  if (message === "Non-finite numeric result" || message.startsWith("Non-finite numeric result")) return "CD_CALC_NONFINITE";
  if (message.startsWith("Unknown identifier:")) return "CD_CALC_UNKNOWN_IDENTIFIER";
  if (message.startsWith("Unknown property:") || message.includes("Unknown property:")) return "CD_CALC_UNKNOWN_PROPERTY";
  if (message.startsWith("Upstream error in")) return "CD_CALC_UPSTREAM_ERROR";
  if (message.includes("Only std.* function calls are supported")) return "CD_CALC_UNSAFE_CALL";
  return "CD_CALC_EVAL";
}

export function evaluateExpression(
  expr: Expr,
  env: Record<string, unknown>,
  std: unknown,
  tablePkByArray: WeakMap<object, { primaryKey: string }>
): unknown {
  const ctx: EvalContext = { stdFunctions: collectStdFunctions(std), tablePkByArray };
  const hasStd = Object.prototype.hasOwnProperty.call(env, "std");
  const runtimeEnv = hasStd ? env : Object.assign(Object.create(null), env, { std });
  return evalExpr(expr, runtimeEnv, ctx);
}

export function evaluateNodes(
  nodes: { name: string; expr?: Expr; dependencies: string[]; line: number }[],
  inputs: Record<string, unknown>,
  std: unknown,
  tablePkByArray: WeakMap<object, { primaryKey: string }>
): EvalResult {
  const messages: CalcdownMessage[] = [];
  const values: Record<string, unknown> = Object.create(null);
  const env: Record<string, unknown> = Object.assign(Object.create(null), inputs, { std });
  const ctx: EvalContext = { stdFunctions: collectStdFunctions(std), tablePkByArray };

  const nodeByName = new Map(nodes.map((n) => [n.name, n]));
  const nodeNames = new Set(nodes.map((n) => n.name));

  for (const n of nodes) {
    if (!n.expr) {
      env[n.name] = makeNodeError(n.name, "Invalid or missing expression");
    }
  }

  const indegree = new Map<string, number>();
  const outgoing = new Map<string, string[]>();

  for (const n of nodes) {
    const deps = n.dependencies.filter((d) => nodeNames.has(d));
    indegree.set(n.name, deps.length);
    for (const d of deps) {
      const arr = outgoing.get(d) ?? [];
      arr.push(n.name);
      outgoing.set(d, arr);
    }
  }

  const order: string[] = [];
  const queue: string[] = [];
  for (const n of nodes) {
    if ((indegree.get(n.name) ?? 0) === 0) queue.push(n.name);
  }

  while (queue.length > 0) {
    const name = queue.shift()!;
    order.push(name);
    for (const dep of outgoing.get(name) ?? []) {
      const next = (indegree.get(dep) ?? 0) - 1;
      indegree.set(dep, next);
      if (next === 0) queue.push(dep);
    }
  }

  if (order.length !== nodes.length) {
    messages.push({
      severity: "error",
      code: "CD_CALC_CYCLE",
      message: "Cycle detected in calc nodes (or unresolved dependencies)",
    });
  }

  for (const name of order) {
    const node = nodeByName.get(name);
    if (!node) continue;
    if (!node.expr) continue;
    try {
      const v = evalExpr(node.expr, env, ctx);
      values[name] = v;
      env[name] = v;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      messages.push({
        severity: "error",
        code: calcErrorCodeForMessage(msg),
        message: msg,
        line: node.line,
        nodeName: node.name,
      });
      env[node.name] = makeNodeError(node.name, msg);
    }
  }

  return { values, messages, env };
}
