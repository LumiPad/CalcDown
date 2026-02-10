# CalcDown 1.2

Status: **current**. CalcDown 1.2 is additive relative to CalcDown 1.1. Unless explicitly stated, all rules from `docs/calcdown-1.1.md` remain in force.

This update is safety-first and additive: deterministic execution, no ambient I/O, no dynamic code evaluation, and defenses against prototype pollution.

## 0) Conventions

The key words **MUST**, **MUST NOT**, **SHOULD**, and **MAY** are to be interpreted as described in RFC 2119.

## 1) CalcScript language additions

CalcDown 1.1 added array indexing (`xs[i]`) and arrow-function destructuring (`({ a, b }) => ...`). This section adds additional CalcScript syntax to reduce boilerplate while staying sandboxable.

### 1.1 Object spread in object literals (`...`)

**Problem:** Enriching rows without mutation is verbose.

**Addition:** Object spread entries inside object literals:

````md
``` calc
const enriched = std.table.map(items, (row) => ({
  ...row,
  total: row.qty * row.price
}));
```
````

Rules:

- Spread syntax MUST be supported only inside object literals: `{ ...expr, key: value, ...expr2 }`.
- Each spread expression MUST evaluate to a non-null object value.
- Spread MUST copy only **own** enumerable string keys from the source object.
- If a spread source contains a forbidden key (`__proto__`, `constructor`, `prototype`), engines MUST throw (do not copy/sanitize silently).
- If multiple spreads / properties produce the same key, the **later** entry MUST win (left-to-right).
- Object literal evaluation MUST produce a “plain record” object that is safe against prototype pollution (e.g. `Object.create(null)`).

Rationale: supports functional table transformations (`map`) without introducing mutation or new control flow.

### 1.2 Nullish coalescing operator (`??`)

**Problem:** Missing or nullable values require noisy conditionals (or fail-fast behavior where “missing” is expected).

**Addition:** `a ?? b`:

````md
``` calc
const safe_rate = annual_rate ?? 0;
```
````

Rules:

- `a ?? b` MUST evaluate to:
  - `a` if `a` is neither `null` nor `undefined`
  - otherwise `b`
- `??` MUST short-circuit (do not evaluate `b` if `a` is present).
- `??` is a **scalar** operator (it does not broadcast element-wise over arrays).
  - For vectorized null-handling, use `std.logic.coalesce(...)` or `std.logic.where(...)` (see `docs/stdlib-1.2.md`).

Rationale: spreadsheet models frequently ingest partially-complete external data.

### 1.3 Let expressions (scoped bindings)

**Problem:** CalcScript only allows top-level `const` declarations; complex expressions often require either duplication or polluting the node namespace.

**Addition:** A scoped binding expression:

````md
``` calc
const monthly_payment = let {
  rate_mo = std.finance.toMonthlyRate(annual_rate);
  months = years * 12;
} in std.finance.pmt(rate_mo, months, -principal);
```
````

Rules:

- `let { ... } in <expr>` MUST be an expression form.
- Each binding MUST have the form `<identifier> = <expr>;`.
- Bindings MUST be evaluated in order and visible to later bindings and the `in` expression.
- Bindings MUST NOT be visible outside the `let` expression.
- Binding names MUST follow normal identifier rules and MUST NOT be `std`.

Rationale: enables “intermediate variables” without adding new node names to the project namespace.

### 1.4 Null / missing value model (clarification)

CalcDown 1.2 SHOULD explicitly standardize how engines represent missing values from external data sources:

- Engines MAY represent “missing” as `null` (preferred) or `undefined`, but:
  - Engines MUST treat both `null` and `undefined` as nullish for `??` and `std.logic.coalesce` (see `docs/stdlib-1.2.md`).
- Engines MUST NOT silently synthesize object keys during column projection; projection remains fail-fast unless an explicit null-aware helper is used.

## 2) Standard library additions (summary)

CalcDown 1.2 expands the standard library (see `docs/stdlib-1.2.md`) with:

- `std.logic` — readable conditional helpers (including a vectorized `where`)
- `std.array` — array utilities beyond `std.data.*`
- `std.stats` — basic statistics for financial models
- `std.date` — extended date helpers and ranges

## 3) View contract additions

CalcDown 1.1 standardized schema-validated views under `library: "calcdown"` and added table `conditionalFormat`. This section adds view enhancements that stay declarative and deterministic.

### 3.1 Table data bars (`dataBar`)

**Addition:** Extend `table.spec.columns[]` with an optional `dataBar` for numeric columns:

```json
{
  "key": "revenue",
  "label": "Revenue",
  "format": "currency",
  "dataBar": { "color": "#3b82f6", "max": "auto" }
}
```

Rules:

- `dataBar` MUST only apply to numeric/currency values.
- If `max` is `"auto"`, engines SHOULD compute the bar scale from the visible rows for that column (deterministically).
- Engines MUST treat non-finite numbers as an error for `dataBar` rendering (consistent with CalcScript numeric rules).

### 3.2 Sparklines in cards (`type: "sparkline"`)

**Addition:** Extend `cards.spec.items[]` with a `sparkline` item:

```json
{
  "type": "sparkline",
  "source": "monthly_projections",
  "key": "revenue",
  "label": "Revenue trend",
  "kind": "line"
}
```

Rules:

- A sparkline MUST be derived from an existing table and a numeric column.
- Engines SHOULD downsample deterministically if needed to keep rendering fast.

### 3.3 Metric cards with comparison (`compare`)

**Addition:** Extend standard card items with an optional comparison:

```json
{
  "key": "mrr",
  "label": "MRR",
  "format": "currency",
  "compare": { "key": "mrr_last_month", "format": "percent", "label": "vs last month" }
}
```

Rules:

- `compare.key` MUST refer to an existing scalar node.
- Engines SHOULD render comparisons with consistent sign and color semantics (positive/negative/neutral).

### 3.4 View visibility conditions (`visible`)

**Addition:** Add an optional `visible` condition on any CalcDown view object:

```json
{
  "id": "warning_card",
  "library": "calcdown",
  "type": "cards",
  "visible": "runway_months < 6",
  "spec": { "title": "Low runway", "items": [{ "key": "runway_months" }] }
}
```

Rules:

- `visible` MAY be a boolean or a CalcScript expression string.
- If `visible` is a string, engines MUST evaluate it as a CalcScript expression in an environment containing:
  - `std`
  - inputs and computed node values (by name)
- The result MUST be a boolean scalar; otherwise, engines MUST emit an error.
- If `visible` is omitted, it defaults to `true`.

### 3.5 Charts (no new kinds in 1.2)

CalcDown 1.2 does not add new chart kinds beyond CalcDown 1.1 (`line`, `bar`, `combo`). Future versions may extend `chart.spec` with additional kinds/overlays as long as they remain declarative, schema-validatable, and deterministic.

## 4) Future candidates (not in 1.2)

These items were not included in CalcDown 1.2 and remain strong candidates for future versions:

- Data block computed columns and validation rules (keep constraints close to data schemas)
- Enum types for columns (enables validation and UI dropdowns)
- Foreign key references between tables (enables joined views and referential checks)
- Tooling: watch mode, a CalcScript REPL, and better error recovery / partial evaluation

## Appendix A) Changes from 1.1 → 1.2

- Adds object spread entries inside object literals (`{ ...row, a: 1 }`).
- Adds nullish coalescing operator (`a ?? b`) with scalar short-circuit semantics.
- Adds `let { ... } in expr` scoped bindings.
- Extends standardized views with:
  - `table` column data bars (`dataBar`)
  - `cards` sparklines (`type: "sparkline"`)
  - card comparisons (`compare`)
  - conditional view visibility (`visible`)
- Expands the standard library with `std.logic`, `std.array`, `std.stats`, and extended `std.date` helpers (see `docs/stdlib-1.2.md`).
