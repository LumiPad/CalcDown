/**
 * Purpose: Infer scalar and table types from program inputs and expressions.
 * Intent: Provide format-friendly type hints for rendering and computed tables.
 */

import type { CalcNode } from "./calcscript/compile.js";
import type { Expr, ObjectLiteralExpr } from "./calcscript/ast.js";
import { getMemberPath } from "./calcscript/parser.js";
import type { DataTable, InputDefinition, InputType } from "./types.js";

type Inferred =
  | { kind: "unknown" }
  | { kind: "scalar"; type: InputType }
  | { kind: "vector"; element: InputType }
  | { kind: "table"; columns: Record<string, InputType>; primaryKey: string | null }
  | { kind: "object"; props: Record<string, Inferred> };

const UNKNOWN: Inferred = { kind: "unknown" };

const numericScalarTypes = new Set(["number", "integer", "decimal", "percent", "currency"]);

function rawTypeString(name: string, args: string[]): string {
  if (args.length === 0) return name;
  return `${name}(${args.join(",")})`;
}

function scalarType(name: string, args: string[] = []): InputType {
  return { name, args, raw: rawTypeString(name, args) };
}

function scalar(name: string, args: string[] = []): Inferred {
  return { kind: "scalar", type: scalarType(name, args) };
}

function vector(element: InputType): Inferred {
  return { kind: "vector", element };
}

function isNumericScalar(t: InputType): boolean {
  return numericScalarTypes.has(t.name);
}

function currencyCode(t: InputType): string | null {
  if (t.name !== "currency") return null;
  const code = t.args[0];
  return typeof code === "string" && code.trim() ? code.trim().toUpperCase() : null;
}

function isPercentType(t: InputType): boolean {
  return t.name === "percent";
}

function currencyTypeWithCode(code: string | null): InputType {
  return scalarType("currency", code ? [code] : []);
}

function combineCurrencyCodes(a: InputType, b: InputType): string | null {
  const ac = currencyCode(a);
  const bc = currencyCode(b);
  if (ac && bc) return ac === bc ? ac : null;
  return ac ?? bc ?? null;
}

function numericResultType(op: string, a: InputType, b: InputType): InputType {
  const aCur = a.name === "currency";
  const bCur = b.name === "currency";
  const aPct = isPercentType(a);
  const bPct = isPercentType(b);

  if (op === "+" || op === "-") {
    if (aCur || bCur) return currencyTypeWithCode(combineCurrencyCodes(a, b));
    if (aPct && bPct) return scalarType("percent");
    return scalarType("number");
  }

  if (op === "*") {
    if (aCur !== bCur && (aCur || bCur)) return currencyTypeWithCode(combineCurrencyCodes(a, b));
    return scalarType("number");
  }

  if (op === "/") {
    if (aCur && !bCur) return currencyTypeWithCode(currencyCode(a));
    if (aPct && !bPct) return scalarType("percent");
    return scalarType("number");
  }

  return scalarType("number");
}

function elementOrScalarType(t: Inferred): InputType | null {
  if (t.kind === "scalar") return t.type;
  if (t.kind === "vector") return t.element;
  return null;
}

function inferNumericBinary(op: string, a: Inferred, b: Inferred): Inferred {
  const aT = elementOrScalarType(a);
  const bT = elementOrScalarType(b);
  if (!aT || !bT) return UNKNOWN;
  if (!isNumericScalar(aT) || !isNumericScalar(bT)) return UNKNOWN;

  const result = numericResultType(op, aT, bT);
  if (a.kind === "vector" || b.kind === "vector") return vector(result);
  return { kind: "scalar", type: result };
}

function inferConditional(consequent: Inferred, alternate: Inferred): Inferred {
  if (consequent.kind === "scalar" && alternate.kind === "scalar") {
    const a = consequent.type;
    const b = alternate.type;
    if (a.name === b.name && JSON.stringify(a.args) === JSON.stringify(b.args)) return consequent;
  }
  if (consequent.kind === "vector" && alternate.kind === "vector") {
    const a = consequent.element;
    const b = alternate.element;
    if (a.name === b.name && JSON.stringify(a.args) === JSON.stringify(b.args)) return consequent;
  }
  if (consequent.kind === "table" && alternate.kind === "table") {
    const aCols = consequent.columns;
    const bCols = alternate.columns;
    const aKeys = Object.keys(aCols).sort();
    const bKeys = Object.keys(bCols).sort();
    if (aKeys.length !== bKeys.length) return UNKNOWN;
    for (let i = 0; i < aKeys.length; i++) {
      const k = aKeys[i]!;
      if (k !== bKeys[i]) return UNKNOWN;
      const at = aCols[k]!;
      const bt = bCols[k]!;
      if (at.name !== bt.name) return UNKNOWN;
      if (JSON.stringify(at.args) !== JSON.stringify(bt.args)) return UNKNOWN;
    }
    return consequent;
  }
  return UNKNOWN;
}

function inferObjectLiteral(expr: ObjectLiteralExpr, env: Record<string, Inferred>): Inferred {
  const props: Record<string, Inferred> = Object.create(null);
  for (const p of expr.properties) {
    props[p.key] = inferExpr(p.value, env);
  }
  return { kind: "object", props };
}

function objectToTableType(obj: Inferred): Inferred {
  if (obj.kind !== "object") return UNKNOWN;
  const columns: Record<string, InputType> = Object.create(null);
  for (const [k, v] of Object.entries(obj.props)) {
    if (v.kind === "scalar") columns[k] = v.type;
    else return UNKNOWN;
  }
  const pk = Object.prototype.hasOwnProperty.call(columns, "id") ? "id" : null;
  return { kind: "table", columns, primaryKey: pk };
}

function inferStdMathAgg(arg0: Inferred): Inferred {
  if (arg0.kind !== "vector") return scalar("number");
  const el = arg0.element;
  if (!isNumericScalar(el)) return scalar("number");
  if (el.name === "currency") return { kind: "scalar", type: currencyTypeWithCode(currencyCode(el)) };
  if (el.name === "percent") return scalar("percent");
  return scalar("number");
}

function inferStdTableCol(rows: Inferred, keyExpr: Expr): Inferred {
  if (rows.kind !== "table") return UNKNOWN;
  if (keyExpr.kind !== "string") return UNKNOWN;
  const key = keyExpr.value;
  const t = rows.columns[key];
  if (!t) return UNKNOWN;
  return vector(t);
}

function inferStdTableSum(rows: Inferred, keyExpr: Expr): Inferred {
  const col = inferStdTableCol(rows, keyExpr);
  if (col.kind !== "vector") return scalar("number");
  const el = col.element;
  if (!isNumericScalar(el)) return scalar("number");
  if (el.name === "currency") return { kind: "scalar", type: currencyTypeWithCode(currencyCode(el)) };
  if (el.name === "percent") return scalar("percent");
  return scalar("number");
}

function inferStdTableMap(rows: Inferred, mapper: Expr, env: Record<string, Inferred>): Inferred {
  if (rows.kind !== "table") return UNKNOWN;
  if (mapper.kind !== "arrow") return UNKNOWN;

  const rowProps: Record<string, Inferred> = Object.create(null);
  for (const [k, t] of Object.entries(rows.columns)) {
    rowProps[k] = { kind: "scalar", type: t };
  }
  const rowObj: Inferred = { kind: "object", props: rowProps };
  const child: Record<string, Inferred> = Object.create(env);
  const p0 = mapper.params[0];
  if (p0) {
    if (p0.kind === "identifier") {
      child[p0.name] = rowObj;
    } else if (p0.kind === "object") {
      for (const p of p0.properties) {
        const t = rows.columns[p.key];
        child[p.binding] = t ? { kind: "scalar", type: t } : UNKNOWN;
      }
    }
  }

  const p1 = mapper.params[1];
  if (p1 && p1.kind === "identifier") child[p1.name] = scalar("integer");

  const bodyType = inferExpr(mapper.body, child);
  if (bodyType.kind === "scalar") return vector(bodyType.type);
  if (bodyType.kind === "object") return objectToTableType(bodyType);
  return UNKNOWN;
}

function inferStdCall(path: string[], expr: Expr, env: Record<string, Inferred>): Inferred {
  if (expr.kind !== "call") return UNKNOWN;
  const args = expr.args;

  if (path.length === 3 && path[0] === "std" && path[1] === "math") {
    const fn = path[2];
    if (fn === "sum" || fn === "mean" || fn === "minOf" || fn === "maxOf") {
      const a0 = args[0] ? inferExpr(args[0], env) : UNKNOWN;
      return inferStdMathAgg(a0);
    }
  }

  if (path.length === 3 && path[0] === "std" && path[1] === "table") {
    const fn = path[2];
    const a0 = args[0] ? inferExpr(args[0], env) : UNKNOWN;
    const a1Expr = args[1] ?? null;
    if (fn === "col" && a1Expr) return inferStdTableCol(a0, a1Expr);
    if (fn === "sum" && a1Expr) return inferStdTableSum(a0, a1Expr);
    if (fn === "map") {
      const mapper = args[1] ?? null;
      if (!mapper) return UNKNOWN;
      return inferStdTableMap(a0, mapper, env);
    }
  }

  return UNKNOWN;
}

function inferMember(obj: Inferred, prop: string): Inferred {
  if (obj.kind === "table") {
    const t = obj.columns[prop];
    if (!t) return UNKNOWN;
    return vector(t);
  }
  if (obj.kind === "object") return obj.props[prop] ?? UNKNOWN;
  return UNKNOWN;
}

function inferExpr(expr: Expr, env: Record<string, Inferred>): Inferred {
  switch (expr.kind) {
    case "number":
      return scalar("number");
    case "string":
      return scalar("string");
    case "boolean":
      return scalar("boolean");
    case "identifier":
      return env[expr.name] ?? UNKNOWN;
    case "unary": {
      const inner = inferExpr(expr.expr, env);
      if (expr.op === "!") return scalar("boolean");
      if (expr.op === "-") {
        if (inner.kind === "scalar" && isNumericScalar(inner.type)) return inner;
        if (inner.kind === "vector" && isNumericScalar(inner.element)) return inner;
        return UNKNOWN;
      }
      return UNKNOWN;
    }
    case "binary": {
      if (expr.op === "&&" || expr.op === "||") return scalar("boolean");
      if (expr.op === "<" || expr.op === "<=" || expr.op === ">" || expr.op === ">=" || expr.op === "==" || expr.op === "!=") {
        return scalar("boolean");
      }

      const a = inferExpr(expr.left, env);
      const b = inferExpr(expr.right, env);

      if (expr.op === "&") {
        if (a.kind === "vector" || b.kind === "vector") return vector(scalarType("string"));
        return scalar("string");
      }

      if (expr.op === "+" || expr.op === "-" || expr.op === "*" || expr.op === "/" || expr.op === "**") {
        return inferNumericBinary(expr.op, a, b);
      }

      return UNKNOWN;
    }
    case "conditional": {
      const c = inferExpr(expr.consequent, env);
      const a = inferExpr(expr.alternate, env);
      return inferConditional(c, a);
    }
    case "member": {
      const obj = inferExpr(expr.object, env);
      return inferMember(obj, expr.property);
    }
    case "index": {
      const obj = inferExpr(expr.object, env);
      if (obj.kind === "vector") return { kind: "scalar", type: obj.element };
      if (obj.kind === "table") {
        const props: Record<string, Inferred> = Object.create(null);
        for (const [k, t] of Object.entries(obj.columns)) props[k] = { kind: "scalar", type: t };
        return { kind: "object", props };
      }
      return UNKNOWN;
    }
    case "call": {
      const path = getMemberPath(expr.callee);
      if (!path || path[0] !== "std") return UNKNOWN;
      return inferStdCall(path, expr, env);
    }
    case "object":
      return inferObjectLiteral(expr, env);
    case "arrow":
      // Only inferred when passed into known std.* functions (e.g. std.table.map).
      return UNKNOWN;
    default: {
      const _exhaustive: never = expr;
      return _exhaustive;
    }
  }
}

function topologicalNodeOrder(nodes: CalcNode[]): string[] {
  const nodeByName = new Map(nodes.map((n) => [n.name, n]));
  const nodeNames = new Set(nodes.map((n) => n.name));
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
    // Cycle or unresolved dependencies: fall back to declared order.
    return nodes.map((n) => n.name);
  }

  // Ensure we only return known nodes.
  return order.filter((n) => nodeByName.has(n));
}

const COMPUTED_HASH = "sha256:0000000000000000000000000000000000000000000000000000000000000000";

function computedTableSchema(name: string, t: Extract<Inferred, { kind: "table" }>): DataTable {
  const keys = Object.keys(t.columns);
  const pk = t.primaryKey ?? (keys.includes("id") ? "id" : keys[0] ?? "id");
  return {
    name,
    primaryKey: pk,
    columns: t.columns,
    rows: [],
    source: { uri: `calcdown:computed:${name}`, format: "json", hash: COMPUTED_HASH },
    line: 0,
  };
}

export interface InferCalcdownTypesResult {
  valueTypes: Record<string, InputType>;
  computedTables: Record<string, DataTable>;
}

export function inferCalcdownTypes(program: {
  inputs: InputDefinition[];
  tables: DataTable[];
  nodes: CalcNode[];
}): InferCalcdownTypesResult {
  const env: Record<string, Inferred> = Object.create(null);
  const valueTypes: Record<string, InputType> = Object.create(null);
  const computedTables: Record<string, DataTable> = Object.create(null);

  for (const def of program.inputs) {
    env[def.name] = { kind: "scalar", type: def.type };
    valueTypes[def.name] = def.type;
  }

  for (const t of program.tables) {
    env[t.name] = { kind: "table", columns: t.columns, primaryKey: t.primaryKey };
  }

  const nodeByName = new Map(program.nodes.map((n) => [n.name, n]));
  for (const name of topologicalNodeOrder(program.nodes)) {
    const node = nodeByName.get(name);
    if (!node) continue;
    if (!node.expr) {
      env[name] = UNKNOWN;
      continue;
    }

    const inferred = inferExpr(node.expr, env);
    env[name] = inferred;

    if (inferred.kind === "scalar") {
      valueTypes[name] = inferred.type;
      continue;
    }

    if (inferred.kind === "table") {
      computedTables[name] = computedTableSchema(name, inferred);
      continue;
    }
  }

  return { valueTypes, computedTables };
}
