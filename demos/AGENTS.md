# Demos — Agent Instructions

Scope: `demos/**`.

This folder contains static demo pages served by `make demo`.

## Rules

- Keep demos dependency-light (no bundler/dev server required).
- Demo pages should load compiled modules from `dist/`.
- Prefer relative URLs (so the demos can be hosted under a subpath).
- YAML `view` blocks are enabled via `importmap` mapping `"js-yaml"` to `node_modules/` in these static pages.
- Demos MUST use CalcDown’s base UI styles via `installCalcdownStyles()` and a `.calcdown-root` page root (preferably on `<body>`).
- Keep demo CSS limited to page scaffolding (layout/spacing/textarea controls). Do **not** restyle CalcDown component primitives:
  - Avoid CSS rules targeting `.view`, `.view-title`, `.cards`, `.card`, `.calcdown-*` (except `.calcdown-root { --calcdown-*: ... }`), `.chart-legend*`, or global `table/th/td/pre`.
- Prefer CalcDown-provided renderers/helpers (`mountCalcdown`, `mountCalcdownDocument`, `renderInputsForm`, `renderCalcdownViews`) over bespoke DOM render logic.
