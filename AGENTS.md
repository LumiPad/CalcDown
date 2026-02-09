# CalcDown — Agent Instructions

These instructions apply to the whole repository unless a more specific `AGENTS.md` exists in a subdirectory.

## Project intent

- Treat **spec + docs as the product** (the implementation is a scaffold/prototype).
- Keep CalcDown **text-first, Git-friendly, deterministic, and browser-first**.
- Prefer semantic names (nodes/tables) over positional references (no A1-style thinking).

## Quick commands

- `make build` — compile TypeScript into `dist/`
- `make typecheck` — strict TS typecheck
- `make analyze` — static analysis (unused locals/params)
- `make test` — Node test runner + coverage thresholds (stdlib)
- `make source-check` — check TS headers + soft word limit
- `make agents-check` — enforce AGENTS.md coverage + scopes
- `make demo-check` — enforce demo minimalism + styling rules
- `make check` — `typecheck + analyze + source-check + agents-check + demo-check + test`
- `make conformance` — deterministic conformance suite (versions + fmt-check + examples-check + golden outputs)
- `make verify` — `make check + make conformance`
- `make fmt` — canonicalize examples
- `make fmt-check` — check formatting (no writes)
- `make validate` — validate a project (ENTRY=...)
- `make lock` — write lockfile (ENTRY=... OUT=...)
- `make export` — export evaluated output (ENTRY=... EXPORT_OUT=...)
- `make diff` — semantic diff (A=... B=...)
- `make demo` — build then serve demos
- `make dump` — write a single-file repo dump for LLM review (gitignored)

## QA policy

- Always run `make check` and `make conformance` before considering work “done” (or run `make verify`).

## Dependency policy

- Avoid adding new runtime dependencies unless there is a clear win.
- Prefer Node/TypeScript built-ins and small, auditable code.
- Assume network access may be unavailable in some environments; keep workflows offline-friendly.

## Safety model (important)

- Do **not** use `eval`, `new Function`, dynamic `import()`, or access to browser globals in CalcScript evaluation.
- Keep prototype-pollution defenses intact (`__proto__`, `constructor`, `prototype`).
- `std` is reserved; do not allow user code to shadow it.

## Documentation rules

- Specs are versioned under `docs/` (e.g. `docs/calcdown-1.0.md`, `docs/stdlib-1.0.md`).
- Older versions stay **archived/superseded**, not rewritten.
- Keep examples executable and consistent with the latest spec.

## Demo rules

- Demos should showcase CalcDown’s **own** UI/components (from `src/web/index.ts`), not custom re-implementations.
- Demos MUST call `installCalcdownStyles()` and ensure the page has a `.calcdown-root` element (preferably on `<body>`).
- Demo CSS should be limited to page scaffolding (layout, spacing). Do **not** style CalcDown primitives like `.view`, `.view-title`, `.cards`, `.card`, `.calcdown-*`, or `table/th/td` (except setting `--calcdown-*` CSS variables on `.calcdown-root`).
