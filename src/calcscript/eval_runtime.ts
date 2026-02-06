/**
 * Purpose: Provide shared runtime safety and context helpers for CalcScript evaluation.
 * Intent: Centralize node-error sentinels, safe property access, and std function discovery.
 */

const bannedProperties = new Set(["__proto__", "prototype", "constructor"]);

const NODE_ERROR = Symbol("calcdown.node.error");

type NodeErrorInfo = { nodeName: string; message: string };

export type NodeErrorSentinel = { [NODE_ERROR]: NodeErrorInfo };

export interface EvalContext {
  stdFunctions: Set<Function>;
  tablePkByArray: WeakMap<object, { primaryKey: string }>;
}

export function makeNodeError(nodeName: string, message: string): NodeErrorSentinel {
  const sentinel = Object.create(null) as NodeErrorSentinel;
  (sentinel as unknown as Record<symbol, unknown>)[NODE_ERROR] = { nodeName, message };
  return sentinel;
}

export function isNodeError(v: unknown): v is NodeErrorSentinel {
  return (typeof v === "object" || typeof v === "function") && v !== null && NODE_ERROR in (v as object);
}

export function nodeErrorInfo(v: NodeErrorSentinel): NodeErrorInfo {
  return v[NODE_ERROR];
}

export function isBannedProperty(prop: string): boolean {
  return bannedProperties.has(prop);
}

export function safeGet(obj: unknown, prop: string): unknown {
  if (isBannedProperty(prop)) throw new Error(`Disallowed property access: ${prop}`);
  if ((typeof obj !== "object" && typeof obj !== "function") || obj === null) {
    throw new Error(`Cannot access property ${prop} on non-object`);
  }
  if (!Object.prototype.hasOwnProperty.call(obj, prop)) {
    throw new Error(`Unknown property: ${prop}`);
  }
  return (obj as Record<string, unknown>)[prop];
}

export function collectStdFunctions(std: unknown): Set<Function> {
  const out = new Set<Function>();
  const seen = new WeakSet<object>();

  function visit(v: unknown): void {
    if ((typeof v !== "object" && typeof v !== "function") || v === null) return;
    const obj = v as object;
    if (seen.has(obj)) return;
    seen.add(obj);

    if (typeof v === "function") {
      out.add(v);
      return;
    }

    for (const key of Object.keys(v as Record<string, unknown>)) {
      visit((v as Record<string, unknown>)[key]);
    }
  }

  visit(std);
  return out;
}
