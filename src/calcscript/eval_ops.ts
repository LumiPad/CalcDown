/**
 * Purpose: Implement scalar/vector operators used by CalcScript expression evaluation.
 * Intent: Keep arithmetic, comparison, and concatenation semantics strict and deterministic.
 */

export function assertFiniteNumber(v: unknown, label: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`${label} expects finite number`);
  return v;
}

export function assertFiniteResult(v: number): number {
  if (!Number.isFinite(v)) throw new Error("Non-finite numeric result");
  return v;
}

export function assertBoolean(v: unknown, label: string): boolean {
  if (typeof v !== "boolean") throw new Error(`${label} expects boolean`);
  return v;
}

export function assertValidDate(v: unknown, label: string): Date {
  if (!(v instanceof Date) || Number.isNaN(v.getTime())) throw new Error(`${label} expects valid Date`);
  return v;
}

export function compareScalars(op: "<" | "<=" | ">" | ">=", a: unknown, b: unknown): boolean {
  if (typeof a === "number" && typeof b === "number") {
    const aa = assertFiniteNumber(a, `Binary '${op}'`);
    const bb = assertFiniteNumber(b, `Binary '${op}'`);
    if (op === "<") return aa < bb;
    if (op === "<=") return aa <= bb;
    if (op === ">") return aa > bb;
    return aa >= bb;
  }

  if (a instanceof Date && b instanceof Date) {
    const aa = assertValidDate(a, `Binary '${op}'`).getTime();
    const bb = assertValidDate(b, `Binary '${op}'`).getTime();
    if (op === "<") return aa < bb;
    if (op === "<=") return aa <= bb;
    if (op === ">") return aa > bb;
    return aa >= bb;
  }

  throw new Error(`Binary '${op}' expects numbers or dates`);
}

export function strictEquals(a: unknown, b: unknown): boolean {
  if (typeof a === "number" && typeof b === "number") {
    const aa = assertFiniteNumber(a, "Binary '=='");
    const bb = assertFiniteNumber(b, "Binary '=='");
    return aa === bb;
  }
  if (typeof a === "string" && typeof b === "string") return a === b;
  if (typeof a === "boolean" && typeof b === "boolean") return a === b;
  if (a instanceof Date && b instanceof Date) {
    const aa = assertValidDate(a, "Binary '=='").getTime();
    const bb = assertValidDate(b, "Binary '=='").getTime();
    return aa === bb;
  }
  if (a === null && b === null) return true;
  if (a === undefined && b === undefined) return true;

  if (a === null || a === undefined || b === null || b === undefined) return false;
  if (typeof a === "number" || typeof a === "string" || typeof a === "boolean") return false;
  if (typeof b === "number" || typeof b === "string" || typeof b === "boolean") return false;
  if (a instanceof Date || b instanceof Date) return false;

  throw new Error("Binary '==' expects comparable scalars");
}

function concatPartToString(v: unknown, label: string): string {
  if (typeof v === "string") return v;
  if (typeof v === "number") {
    if (!Number.isFinite(v)) throw new Error(`${label} expects finite number`);
    return String(v);
  }
  throw new Error(`${label} expects string or finite number`);
}

export function evalUnaryMinus(v: unknown, label: string): unknown {
  if (!Array.isArray(v)) {
    return assertFiniteResult(-assertFiniteNumber(v, label));
  }
  const out = new Array<number>(v.length);
  for (let i = 0; i < v.length; i++) {
    out[i] = assertFiniteResult(-assertFiniteNumber(v[i], `${label} [index ${i}]`));
  }
  return out;
}

export function evalConcat(a: unknown, b: unknown, label: string): unknown {
  const aIsArray = Array.isArray(a);
  const bIsArray = Array.isArray(b);

  if (!aIsArray && !bIsArray) {
    return concatPartToString(a, label) + concatPartToString(b, label);
  }

  if (aIsArray && bIsArray) {
    const aa = a as unknown[];
    const bb = b as unknown[];
    if (aa.length !== bb.length) {
      throw new Error(`${label} vector length mismatch: ${aa.length} vs ${bb.length}`);
    }
    const out = new Array<string>(aa.length);
    for (let i = 0; i < aa.length; i++) {
      out[i] = concatPartToString(aa[i], `${label} [index ${i}]`) + concatPartToString(bb[i], `${label} [index ${i}]`);
    }
    return out;
  }

  if (aIsArray) {
    const aa = a as unknown[];
    const sb = concatPartToString(b, `${label} (scalar right)`);
    const out = new Array<string>(aa.length);
    for (let i = 0; i < aa.length; i++) {
      out[i] = concatPartToString(aa[i], `${label} [index ${i}]`) + sb;
    }
    return out;
  }

  const sa = concatPartToString(a, `${label} (scalar left)`);
  const bb = b as unknown[];
  const out = new Array<string>(bb.length);
  for (let i = 0; i < bb.length; i++) {
    out[i] = sa + concatPartToString(bb[i], `${label} [index ${i}]`);
  }
  return out;
}

export function evalNumericBinary(
  op: string,
  a: unknown,
  b: unknown,
  scalarFn: (x: number, y: number) => number
): unknown {
  const aIsArray = Array.isArray(a);
  const bIsArray = Array.isArray(b);

  if (!aIsArray && !bIsArray) {
    return assertFiniteResult(scalarFn(assertFiniteNumber(a, `Binary '${op}'`), assertFiniteNumber(b, `Binary '${op}'`)));
  }

  if (aIsArray && bIsArray) {
    const aa = a as unknown[];
    const bb = b as unknown[];
    if (aa.length !== bb.length) {
      throw new Error(`Vector length mismatch: ${aa.length} vs ${bb.length}`);
    }
    const out = new Array<number>(aa.length);
    for (let i = 0; i < aa.length; i++) {
      out[i] = assertFiniteResult(
        scalarFn(assertFiniteNumber(aa[i], `Binary '${op}' [index ${i}]`), assertFiniteNumber(bb[i], `Binary '${op}' [index ${i}]`))
      );
    }
    return out;
  }

  if (aIsArray) {
    const aa = a as unknown[];
    const sb = assertFiniteNumber(b, `Binary '${op}' (scalar right)`);
    const out = new Array<number>(aa.length);
    for (let i = 0; i < aa.length; i++) {
      out[i] = assertFiniteResult(scalarFn(assertFiniteNumber(aa[i], `Binary '${op}' [index ${i}]`), sb));
    }
    return out;
  }

  const sa = assertFiniteNumber(a, `Binary '${op}' (scalar left)`);
  const bb = b as unknown[];
  const out = new Array<number>(bb.length);
  for (let i = 0; i < bb.length; i++) {
    out[i] = assertFiniteResult(scalarFn(sa, assertFiniteNumber(bb[i], `Binary '${op}' [index ${i}]`)));
  }
  return out;
}
