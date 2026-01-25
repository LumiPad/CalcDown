# Demos — Agent Instructions

Scope: `demos/**`.

This folder contains static demo pages served by `make demo`.

## Rules

- Keep demos dependency-light (no bundler/dev server required).
- Demo pages should load compiled modules from `dist/`.
- Prefer relative URLs (so the demos can be hosted under a subpath).
- YAML `view` blocks are enabled via `importmap` mapping `"js-yaml"` to `node_modules/` in these static pages.

