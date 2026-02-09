# CalcScript — Agent Instructions

Scope: `src/calcscript/**`.

This folder implements the CalcScript expression language used by CalcDown `calc` blocks.

## Goals

- Keep evaluation **deterministic** and **sandboxed** (no ambient I/O, time, randomness).
- Keep syntax/semantics and error messages **stable** (downstream tooling + conformance rely on them).
- Treat user code and data as **untrusted** input.

## Safety rules (non-negotiable)

- Do **not** introduce `eval`, `new Function`, dynamic `import()`, or reflective access to browser/Node globals.
- Maintain prototype-safety: member access must be **own-properties only** and must block `__proto__`, `constructor`, `prototype`.
- `std` is reserved: do not allow user code to shadow it (including as arrow params).

## Change discipline

- Prefer small, explicit parsing/evaluation logic over cleverness.
- Any grammar/semantic change MUST come with tests and (if user-visible) spec/docs updates.
- Preserve stable diagnostics when possible (error codes + wording) to avoid breaking golden outputs.

