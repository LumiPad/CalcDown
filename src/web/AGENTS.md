# Web — Agent Instructions

Scope: `src/web/**`.

This folder contains the browser-first UI layer: rendering of standardized CalcDown views (cards/table/chart/layout) and `.md` notebook rendering.

## Goals

- Keep UI **dependency-light**, **deterministic**, and embeddable.
- Make charts “pretty by default” without requiring per-demo CSS.
- Keep rendering safe (no XSS / no unsafe HTML injection).

## Rules

- Prefer DOM APIs over `innerHTML` for user-controlled content.
- Keep styling centralized in `src/web/styles.ts` using `--calcdown-*` CSS variables.
- Demos should not re-skin components; demos should install base styles via `installCalcdownStyles()`.
- For charts: prefer SVG with sensible heuristics for dense data (e.g. marker culling).
- When adding or changing view features, update:
  - view contract types + validation
  - JSON schema(s)
  - docs/examples (and keep them executable)
  - tests/conformance where applicable

