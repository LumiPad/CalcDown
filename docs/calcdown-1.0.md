# CalcDown 1.0 (Specification)

Status: **1.0**. CalcDown is a text-first, Git-friendly format for “spreadsheet-like” models: typed inputs and data, a deterministic compute graph, and declarative views.

This document specifies **CalcDown 1.0** (the file format, project files, execution model, Editor Protocol, and expected tooling). The companion standard library is specified in `docs/stdlib-1.0.md`.

This spec is a consolidation of the archived `0.x` drafts under `docs/calcdown-0.*.md`.

## 0) Conventions

The key words **MUST**, **MUST NOT**, **SHOULD**, and **MAY** are to be interpreted as described in RFC 2119.

Line numbers in this spec are **1-based** (consistent with CalcDown messages).

### 0.1 Fenced code blocks (CalcDown blocks)

CalcDown blocks are encoded as fenced code blocks inside Markdown.

A fenced code block is a CalcDown block if its fence info string indicates a CalcDown block kind:

- **Short form**: the info string’s first token is one of: `inputs`, `data`, `calc`, `view`.
- **Explicit form (recommended for mixed documents)**: the info string begins with `calcdown` followed by a kind token (e.g. `calcdown view`), or is written as `calcdown:<kind>` (e.g. `calcdown:view`).

Parsers MUST ignore fenced code blocks that are not CalcDown blocks (e.g. `mermaid`, `js`, or fences with no language tag).

Validators:

- SHOULD emit an error if an explicit `calcdown` block marker is present but the kind token is missing or unknown.
- MAY emit a warning for common near-misses (`input`, `views`, `datas`, `calcs`) to reduce silent typos.

Rationale: CalcDown documents are Markdown. Allowing non-CalcDown fenced code blocks enables mixing narrative docs and diagrams (e.g. Mermaid) alongside executable models while keeping CalcDown blocks unambiguous.

### 0.2 Narrative comments (recommended)

CalcDown documents are normal Markdown. In narrative text (i.e. outside fenced CalcDown blocks), engines:

- SHOULD treat HTML comments `<!-- ... -->` as invisible.
- MAY treat lines whose first non-whitespace characters are `%%` as invisible comments (Mermaid-style).

### 0.3 Type argument syntax (recommended)

CalcDown types are written as tokens like `number`, `date`, or `currency(USD)`.

Engines:

- SHOULD treat core scalar type names as case-insensitive (e.g. `Currency` ≡ `currency`).
- MAY accept square brackets `Type[Arg]` as a synonym for parentheses `type(arg)` (e.g. `Currency[USD]` ≡ `currency(USD)`).

### 0.4 Currency propagation (recommended)

CalcDown `currency(XXX)` values are still **numbers** at evaluation time, but engines SHOULD preserve currency types when inferring default display formats for derived values.

In particular, engines SHOULD treat arithmetic between `currency(XXX)` and other numeric scalars as yielding `currency(XXX)` (e.g. `currency * number → currency`, `currency + number → currency`), and aggregation over currency vectors SHOULD yield currency (e.g. `std.math.sum(currency[]) → currency`).

Engines MAY also use currency types to infer view formatting defaults. For example, engines MAY treat view formats `currency` / `{ kind: "currency" }` as a shorthand for “render this value as currency using the bound type’s ISO currency code (if known)”.

Terms used in this spec:

- **Document**: a single CalcDown Markdown file (recommended extension: `.calc.md`).
- **Project**: a set of documents loaded together (via `include` and/or a manifest).
- **Manifest**: a JSON project file (`calcdown.json`) that declares the entry document and optional includes.
- **Lockfile**: a JSON file (`calcdown.lock.json`) that pins document and external data hashes for reproducibility.
- **Block**: a fenced code block that defines CalcDown content (see §0.1).
- **Input**: a named, typed scalar value provided by the user/environment.
- **Table**: a set of typed rows, addressed by stable row identity (via `primaryKey`).
- **Node**: a named computed value defined in `calc` (scalar, column, or table-like).
- **View**: a declarative description of how to present existing values (cards, tables, charts, layout).

## 1) Design goals

- **Text is the source of truth:** the semantic model is stored as plain text; UIs are projections.
- **AI- and Git-friendly:** named nodes/tables, stable identifiers, small diffs.
- **Reactive by default:** computations form a dependency graph (DAG), re-evaluated incrementally.
- **Deterministic execution:** no ambient I/O, time, or randomness unless explicitly provided as inputs.
- **Browser-first:** intended to run locally in a browser with a safe expression language.

Non-goals (1.x):

- Full Excel parity (macros, add-ins, every edge case).
- Arbitrary side effects inside formulas.
- “Layout as source of truth” authoring (text-first initially).

## 2) Files

CalcDown 1.0 defines:

- **Documents** (`.calc.md`) — the primary authoring format (§2.1)
- An optional **manifest** (`calcdown.json`) — project composition (§2.3)
- An optional **lockfile** (`calcdown.lock.json`) — reproducibility (§2.4)

### 2.1 Document format

A CalcDown document is a UTF‑8 Markdown file containing:

- Optional YAML front matter (`--- ... ---`)
- Markdown narrative
- Fenced code blocks, including CalcDown blocks (§0.1) and optional narrative code blocks

Stand-alone CalcDown models SHOULD use the `.calc.md` extension. Documents that mix CalcDown blocks with other Markdown content/code blocks MAY use `.md`.

### 2.2 Front matter

If present, front matter MUST be YAML and SHOULD include:

- `calcdown`: the spec version (`1.0`)
- `title`: a human-readable title (optional)

Front matter MAY include UI hints (non-normative, but recommended):

- `results`: a comma-separated list of node names to display by default (e.g. `results: total, net_profit`)

Front matter MAY include project composition:

- `include`: additional `.calc.md` files (relative paths) to load as part of the project.

`include` rules:

- Implementations MUST accept `include` as either:
  - a comma-separated string, or
  - a YAML sequence of strings.
- Included paths MUST be resolved relative to the document containing the `include`.
- Implementations MUST load included documents in the listed order.
- Implementations MUST treat the resulting **project** as a single namespace (§3.1).

Version rules:

- Implementations SHOULD accept `calcdown` as either a YAML number (`1.0`) or a string (`"1.0"`), but MUST treat it as an exact version identifier (not a range).
- If `calcdown` is missing, implementations MAY assume the latest supported version, but SHOULD emit a warning.

### 2.3 Project manifest (`calcdown.json`)

CalcDown 1.0 standardizes an optional manifest file to describe a multi-document project without relying solely on per-document front matter.

The manifest MUST be JSON and MUST be a single JSON object.

CalcDown ships a JSON Schema for the manifest:

- `schemas/calcdown-manifest-1.0.schema.json`

Required keys:

- `entry` (string, required): path to the entry `.calc.md` document.

Optional keys:

- `calcdown` (string|number, optional): the spec version (recommended `"1.0"`).
- `include` (string|array, optional): additional `.calc.md` documents to load:
  - if a string, it is treated as a comma-separated list
  - if an array, it MUST be an array of strings
- `lock` (string, optional): path to a lockfile to check during validation and export.
- `results` (string, optional): UI hint equivalent to document front matter `results`.

Path resolution rules:

- `entry`, `include[]`, and `lock` MUST be resolved relative to the manifest file location.

Project loading rules:

- When a manifest is used, implementations MUST load `entry` first, then recursively load `include` from document front matter (§2.2), then load any manifest-level `include` documents.
- Duplicate document loads MUST be de-duplicated by absolute path.
- If `lock` is present and the project is loaded via the manifest, implementations MUST treat it as the default lockfile for `calcdown validate` and `calcdown export` (unless an explicit `--lock` is provided).

### 2.4 Lockfile (`calcdown.lock.json`)

CalcDown 1.0 standardizes an optional lockfile to support reproducible review and CI checks.

The lockfile MUST be JSON and MUST be a single JSON object.

CalcDown ships a JSON Schema for the lockfile:

- `schemas/calcdown-lock-1.0.schema.json`

Required keys:

- `calcdown` (string, required): `"1.0"` (lockfile schema version).
- `entry` (string, required): the resolved entry document path (project-relative or absolute).
- `documents` (array, required): pinned document content hashes.

`documents[]` entry shape:

- `path` (string, required): project-relative or absolute path to a `.calc.md` document.
- `sha256` (string, required): lower-case 64-hex SHA-256 of the document UTF‑8 bytes.

Optional keys:

- `manifest` (string, optional): project-relative or absolute path to the manifest file.
- `dataSources` (array, optional): pinned external data content hashes.

`dataSources[]` entry shape:

- `table` (string, required): the table name in the CalcDown project.
- `source` (string, required): resolved source identifier (URL or project-relative/absolute file path).
- `format` (string, required): `csv` or `json`.
- `declaredHash` (string, required): the hash string declared in the document (`sha256:<hex>`).
- `sha256` (string, required): lower-case 64-hex SHA-256 of the external data UTF‑8 bytes.

Lock semantics:

- `calcdown lock` SHOULD produce deterministic output (stable ordering, no timestamps).
- `calcdown validate --lock <file>` MUST fail if:
  - any `documents[]` hash mismatches, or
  - any project document is not present in `documents[]`, or
  - any referenced `dataSources[]` hash mismatches, or
  - any project data source is not present in `dataSources[]` (when `dataSources` is present).

## 3) Blocks

CalcDown 1.0 defines the following block types (by code-fence language tag):

- `inputs` — typed parameters
- `data` — tables (inline JSONL or external CSV/JSON sources)
- `calc` — computed nodes (CalcScript subset; see §4)
- `view` — declarative views (cards, tables, charts, layout)

Documents MAY contain multiple blocks of the same type. Semantically, blocks are concatenated by type (e.g. all `inputs` blocks contribute to the input namespace).

### 3.1 Naming and namespaces (project-wide)

All identifiers share a single namespace across the project:

- input names
- data table names
- calc node names

Rules:

- Names MUST match `^[A-Za-z_][A-Za-z0-9_]*$`.
- Names MUST be unique across the entire project (no overlaps between inputs/tables/nodes).
- The identifier `std` is reserved and MUST NOT be used as an input/table/node name.

### 3.2 `inputs` block

Defines named, typed scalar values.

**Syntax (one per line):**

```
<name> : <type> = <default> [# comment]
```

Rules:

- Input defaults MUST be parseable as the declared type.
- Implementations SHOULD expose inputs as UI controls (field/slider/date picker).

### 3.3 `data` block (tables)

`data` blocks declare a single table with:

- A YAML header (schema + options)
- A `---` separator line
- One of:
  - Inline JSON Lines (JSONL), one row per line (diff-friendly), or
  - An external source reference (CSV/JSON) with a content hash (diff-friendly “big data” story)

#### 3.3.1 Header keys

Required:

- `name` (string, required): table name
- `primaryKey` (string, required): column name used as stable row identity
- `columns` (map, required): `columnName: type`

Optional (external sources):

- `source` (string, optional): a relative path or URL to load data from
- `format` (string, optional): `"csv"` or `"json"` (if omitted, engines MAY infer from `source` extension)
- `hash` (string, optional): content hash of the external data, in the form `sha256:<hex>`

Optional (ordering):

- `sortBy` (string, optional): a column name used to order rows deterministically after loading.

Rules:

- If `sortBy` is present, engines MUST order the in-memory row array by that column before evaluating dependent nodes.
- Sorting MUST be stable (ties preserve prior order).
- Missing values (`null`/`undefined`) MUST sort last.

Availability to `calc`:

- A `data` table MUST be available in `calc` expressions by its `name` identifier.
- Engines SHOULD provide a row-oriented view equivalent to `Array<Record<string, unknown>>` (one object per row).

#### 3.3.2 Inline rows (JSONL)

If `source` is not present, the rows section MUST be JSONL.

Rules:

- Each JSONL line MUST be a JSON object.
- Each row object MUST include the `primaryKey` field.
- Primary keys MUST be unique within the table and SHOULD be stable across edits.

#### 3.3.3 External sources (CSV / JSON)

If `source` is present, the rows section MUST be empty (blank lines and comments MAY be present).

Rules:

- When `source` is present, `hash` MUST also be present.
- Engines MUST load `source`, verify `hash`, then parse and coerce rows according to `columns`.
- Engines MUST enforce `primaryKey` presence and uniqueness after loading.

Hash rules:

- `sha256:<hex>` is computed over the raw UTF‑8 bytes of the external file content.

## 4) `calc` block (CalcScript subset)

`calc` blocks define computed nodes using a safe, deterministic expression subset (“CalcScript”).

Each top-level declaration has the form:

```ts
const <name> = <expr>;
```

Rules:

- Only `const` declarations are defined.
- Declarations MUST end with `;` (semicolon).
- Engines MUST compute nodes as a DAG (topologically sorted).
- The only ambient global identifier is `std` (the standard library).
- Calls MUST have a callee that is a member path rooted at `std` (e.g. `std.finance.pmt(...)`).

CalcScript expressions (1.0) support:

- Literals: numbers, strings, booleans
- Identifiers
- Object literals (`{ a: 1, b }`)
- Arrow functions (`(x) => x + 1`) for use as arguments to `std.*` APIs
- Member access (`obj.key`) and calls (`std.math.sum(xs)`), subject to the safety rules above
- Operators:
  - Unary:
    - `-` (numeric; scalar or array)
    - `!` (boolean; scalar only)
  - Binary numeric: `+`, `-`, `*`, `/`, `**` (numeric; scalar/array broadcasting)
  - Binary text: `&` (deterministic concatenation; scalar/array broadcasting)
  - Binary comparison: `<`, `<=`, `>`, `>=` (scalar only; numbers or dates)
  - Binary equality: `==`, `!=` (scalar only; strict; numbers/strings/booleans/dates). Engines MUST also accept `===` and `!==` as synonyms for `==` and `!=`.
  - Binary boolean: `&&`, `||` (boolean; scalar only; short-circuit)
  - Conditional operator: `?:` (boolean test; scalar only)

Operator precedence (highest → lowest):

1. `**`
2. unary `-` `!`
3. `*` `/`
4. `+` `-`
5. `&`
6. `<` `<=` `>` `>=`
7. `==` `!=` (including `===` / `!==`)
8. `&&`
9. `||`
10. `?:`

Vectorization rules:

- Unary `-` MUST apply element-wise when its operand is an array.
- Unary `!` MUST only accept a boolean scalar (arrays are not supported).
- For binary numeric operators (`+`, `-`, `*`, `/`, `**`):
  - scalar ⨯ scalar → scalar
  - array ⨯ array → array (element-wise; length mismatch is an error)
  - array ⨯ scalar → array (broadcast scalar)
  - scalar ⨯ array → array (broadcast scalar)
- Numeric operators MUST throw if any operand (scalar or array element) is not a finite number.
- Division by zero MUST be an error.
- Comparison and equality operators MUST only accept scalar operands (no vectorization).
- Boolean operators (`&&`, `||`) MUST only accept boolean scalars (no vectorization).

Column projection:

- For member access `obj.key`, if `obj` evaluates to an array and `key` is not an own-property on that array:
  - If `key` is a standard `Array.prototype` property, access MUST fail (to preserve the safety model).
  - Otherwise, the result MUST be an array obtained by projecting `key` from each element.
  - Projection MUST fail if any element is not an object or does not have `key` as an own-property.

`&` rules:

- Operands MUST be either:
  - a `string`
  - a finite `number`
  - an array of `string | finite number`
- If either operand is an array, then the other operand MUST be either a scalar (broadcast) or an array of the same length.

### 4.1 Table patch statements (optional)

CalcDown 1.0 adds an optional convenience: engines MAY recognize **table patch statements** inside `calc` blocks to update inline `data` tables (typically used as “output templates”).

**Syntax:**

````md
``` calc
table["<primaryKey>"].<column> = <expr>;
```
````

Rules:

- Patch targets MUST be inline `data` tables (no `source`).
- Patch selectors SHOULD use `primaryKey` string literals. Engines MAY also support 1-based row indices (`table[1].col = ...;`) but SHOULD warn because canonical formatting may reorder rows.
- `<column>` MUST be a declared column and MUST NOT be the table’s `primaryKey`.
- Patch `<expr>` MUST be a CalcScript expression.
- Patches MUST be applied after evaluating `const` calc nodes. Patched table values MUST be visible to views and to subsequent patch statements in the same run.
- Patches MUST NOT affect the evaluation of `const` calc nodes.

## 5) `view` block (standardized views)

Views are declarative and MUST be derivable from existing nodes/tables.

A `view` block MUST be either:

- A single view object (JSON object or YAML mapping), or
- A list of view objects (JSON array or YAML sequence)

Engines MUST accept JSON. Engines SHOULD accept YAML as a convenience. Documents intended for maximum portability SHOULD prefer JSON.

### 5.1 CalcDown view contract (`library: "calcdown"`)

CalcDown 1.0 standardizes view types under `library: "calcdown"`:

- `cards` — standardized results pane
- `table` — standardized tabular renderer (optionally editable)
- `chart` — standardized chart wrapper (small chart spec)
- `layout` — standardized composition of other views

Engines MUST validate `library: "calcdown"` views and MUST apply defaults where specified.

CalcDown ships JSON Schemas for these views:

- `schemas/calcdown-view-1.0.schema.json`
- `schemas/calcdown-view-cards-1.0.schema.json`
- `schemas/calcdown-view-table-1.0.schema.json`
- `schemas/calcdown-view-chart-1.0.schema.json`
- `schemas/calcdown-view-layout-1.0.schema.json`

CalcDown 1.0 standardizes a small ergonomic default:

- If a view spec object has a `key` and omits `label`, engines SHOULD default `label` to a humanized Title Case form of the key when the key is snake_case or kebab-case (e.g. `foo_bar` → `Foo Bar`).

CalcDown 1.0 extends the standardized `chart` view to support **multiple plotted series**.

For `library: "calcdown"` charts:

- `chart.spec.x` is unchanged (one axis spec object).
- `chart.spec.kind` MUST be one of: `line`, `bar` (or `column`), or `combo`.
- `chart.spec.y` MAY be either:
  - a single axis spec object (legacy), or
  - an array of axis spec objects, where each entry is plotted as a separate series.
- If `chart.spec.kind` is `combo`, `chart.spec.y` MUST be an array with at least 2 series.
- Axis specs in `chart.spec.y` MAY include:
  - `kind`: `line` or `bar` (or `column`) to control per-series rendering in `combo` charts. If omitted, engines SHOULD default the first series to `bar` and subsequent series to `line`.
  - `area`: boolean. If `true` and the rendered chart has exactly one line series, engines MAY fill the area under that line.

## 6) Types

Scalar types (core):

- `string`
- `boolean`
- `number` (IEEE 754 double)
- `integer` (validated `number`)
- `decimal` (arbitrary precision; implementation-defined)
- `percent` (a numeric percentage in `[0, 100]` by convention)
- `currency(ISO4217)` (numeric with currency metadata)
- `date` (calendar date; ISO `YYYY-MM-DD` text representation)
- `datetime` (timestamp; timezone handling implementation-defined)

## 7) Execution model

- The project defines a dependency graph of nodes: inputs, data tables, computed nodes, views.
- Engines evaluate nodes in topological order.
- On change, engines SHOULD re-evaluate only affected downstream nodes (reactive updates).
- Engines SHOULD evaluate with a deterministic “current datetime” per evaluation session (used by `std.date.now()` and `std.date.today()`).

External data sources (§3.3.3) MUST be loaded and validated before evaluating dependent nodes.

## 8) Editor Protocol (Read → Edit → Write)

CalcDown validates and evaluates a project (“Read → Eval → Print”).

The Editor Protocol standardizes the minimum information needed for spreadsheet-like authoring:

- Render a grid/UI from text
- Accept user edits (inputs, table cells)
- Produce a minimal, deterministic patch back to the original text
- Re-parse and re-evaluate

### 8.1 Source mapping requirements

To support two-way editing, parsers MUST expose sufficient source locations to let an editor update:

- an `inputs` default value line, and
- an inline `data` JSONL row line.

#### 8.1.1 Input mapping

Input definitions MUST include the source line number of the definition (already required by prior versions).

#### 8.1.2 Inline data row mapping (`rowMap`)

When parsing a `data` block with inline JSONL rows (i.e. no `source`), the parser MUST provide a `rowMap` for that table.

`rowMap` MUST be an ordered list where index `i` corresponds to the row index in the parsed `rows` array.

Each `rowMap[i]` entry MUST include:

- `primaryKey` (string): the primary key value (normalized to string)
- `line` (integer): the 1-based line number in the source document where the JSONL row begins

If a row fails to parse or fails validation (missing/invalid/duplicate primary key), it MUST NOT be included in `rows`, and it MUST NOT be included in `rowMap`.

For external `data` tables (`source: ...`), `rowMap` MUST be omitted.

Note on formatting vs runtime ordering: The canonical formatter sorts inline JSONL rows by `primaryKey` to produce stable Git diffs. The optional `sortBy` header key controls runtime row presentation order only and is not applied during formatting.

### 8.2 The patching protocol

Implementations SHOULD provide a patch module that applies atomic edits to CalcDown source text while preserving comments and minimizing unrelated changes.

#### 8.2.1 Atomic operations

The patcher MUST support these operations:

1. `updateInput(name, value)` — update the default value of an input definition.
2. `updateTableCell(tableName, primaryKey, column, value)` — update a single cell in an inline `data` table row (JSONL).

#### 8.2.2 Preservation rules

##### Inputs

For `updateInput` patches:

- Patches MUST NOT remove or change any `#` comment text on the same line.
- Patches SHOULD preserve the original whitespace/indentation before the `#` comment.

##### Inline JSONL rows

For `updateTableCell` patches:

- Patches MUST preserve the line’s leading indentation.
- Patches MUST preserve the row’s primary key value (editors SHOULD treat primary key edits as a separate operation).
- Patches SHOULD preserve the existing JSON key order when possible.
- If a new key must be inserted (e.g. adding a missing column), the patcher SHOULD prefer the column order declared in the table schema.

#### 8.2.3 Type-aware serialization (recommended)

Patchers SHOULD serialize patched values in a way that preserves round-trippability with declared types:

- `integer` values SHOULD be written as JSON numbers with no fractional part.
- `date` values SHOULD be written as ISO strings (`YYYY-MM-DD`).
- `datetime` values SHOULD be written as ISO strings (timezone handling implementation-defined).

### 8.3 External data handling

If a `data` table declares `source: ...` (external CSV/JSON), patchers MUST treat the inline table in the document as read-only.

Implementations SHOULD:

- return an explicit error (“external tables are read-only”), OR
- patch the external source file directly (implementation-defined; must preserve hash semantics).

## 9) Error model and tooling

### 9.1 Messages

Engines MUST surface model errors as user-visible messages. Messages SHOULD include:

- `severity` (`error|warning`)
- `code` (string, stable error code)
- `message` (string)
- `file` (string, optional; for multi-file projects)
- `line` (1-based, optional)
- `column` (1-based, optional)
- `blockLang` (optional)
- `nodeName` (optional)

### 9.2 `calcdown validate`

Implementations SHOULD provide `calcdown validate` that:

- Parses a document/project
- Loads external data sources (verifies hashes)
- Validates schemas, node graph, and views
- Outputs messages with stable codes and locations

Implementations MAY accept `--strict` to treat warnings as errors (non-zero exit status).

If `--lock <path>` is provided, `calcdown validate` MUST also enforce lock semantics (§2.4).

If `--lock` is not provided and the project is loaded via a manifest with `lock`, `calcdown validate` MUST enforce that lockfile.

Implementations MAY accept a runtime clock override for `std.date.now()` / `std.date.today()` (for example: `--date YYYY-MM-DD` or `--datetime ISO`).

### 9.3 `calcdown lock`

Implementations SHOULD provide `calcdown lock` that:

- Loads a project (document or manifest)
- Computes SHA‑256 hashes of all project documents
- Loads external data sources and records their SHA‑256 hashes
- Writes a deterministic lockfile (`calcdown.lock.json` by default)

### 9.4 `calcdown fmt` (canonical formatting)

Implementations SHOULD provide `calcdown fmt` that:

- Normalizes whitespace and line endings
- Normalizes `inputs` lines (spacing and comments) without changing meaning
- Normalizes `data` headers and rows without changing meaning
  - Inline JSONL rows SHOULD be ordered deterministically by `primaryKey`
  - Inline JSON objects SHOULD be serialized with stable key ordering
- Pretty-prints `view` blocks deterministically (stable key ordering)

Implementations MAY accept `--check` to fail if formatting would change any files (without writing changes).

### 9.5 `calcdown diff` (semantic diff)

Implementations SHOULD provide `calcdown diff` that compares two versions of a project and reports semantic changes:

- Inputs added/removed/changed
- Tables (schema + source metadata) added/removed/changed
- Table rows added/removed/changed by `primaryKey` when row data is available
- Nodes added/removed/changed (by expression text)
- Views added/removed/changed (by validated view object)

### 9.6 `calcdown export` (materialized output)

Implementations SHOULD provide `calcdown export` that materializes a project into a single JSON output containing:

- The resolved document list
- Evaluated `values` (`inputs`, `tables`, `nodes`)
- Validated CalcDown views
- Messages (errors/warnings)

CalcDown ships a JSON Schema for the export output:

- `schemas/calcdown-export-1.0.schema.json`

If `--lock <path>` is provided, `calcdown export` MUST enforce lock semantics (§2.4). If the project is loaded via a manifest with `lock` and `--lock` is not provided, `calcdown export` MUST enforce that lockfile.

Implementations MAY accept `--strict` to treat warnings as errors (non-zero exit status).

Implementations MAY accept a runtime clock override for `std.date.now()` / `std.date.today()` (for example: `--date YYYY-MM-DD` or `--datetime ISO`).

### 9.7 Deterministic conformance (recommended)

Implementations SHOULD provide deterministic, machine-readable outputs for `validate` and `export`, enabling golden-file conformance checks in CI (for example: “run validate/export on a fixed set of projects and compare JSON output byte-for-byte”).

## 10) Safety model

CalcDown execution MUST be deterministic by default:

- No access to `window`, `document`, `globalThis`, `fetch`, storage APIs, or timers (unless explicitly implemented by the host).
- No dynamic code evaluation (`eval`, `Function`, `import()`).
- No nondeterminism (time/random) unless explicitly provided as an input or by the host as part of the evaluation context.

Prototype-pollution defenses:

- Engines MUST defensively block `__proto__`, `constructor`, and `prototype` in user-authored member access and object keys.
- Engines SHOULD apply similar defenses when parsing YAML view blocks (reject or sanitize unsafe keys).

## Appendix A) Changes from 0.9 → 1.0

- Consolidates the CalcDown spec into a single 1.0 document (the `0.x` drafts remain archived for historical context).
- Relaxes the `.calc.md` fenced-block exclusivity rule and adds an explicit `calcdown <kind>` / `calcdown:<kind>` marker to support mixing CalcDown with other fenced code blocks (e.g. Mermaid) in one document.
