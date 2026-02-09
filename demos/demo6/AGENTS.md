# Demo 6 — Agent Instructions

Scope: `demos/demo6/**`.

This folder is a small, static browser demo for CalcDown 1.0 notebook parsing.

- Keep it dependency-light (no build tooling here; it loads `dist/` output).
- Prefer simple UI and clear rendering over feature completeness.
- Demonstrate explicit `calcdown <kind>` fenced blocks for `.md` notebooks.
- Follow `demos/AGENTS.md`: use `installCalcdownStyles()` and avoid restyling CalcDown component primitives in demo CSS.
