# Editor — Agent Instructions

Scope: `src/editor/**`.

This folder contains deterministic patching utilities for round-tripping UI edits back into Markdown source.

## Goals

- Keep CalcDown **text-first**: patches should produce small, reviewable diffs.
- Preserve author intent: avoid reformatting unrelated content.
- Keep patch application **deterministic** and **safe**.

## Rules

- Patch by **semantic identity** (input name, table `primaryKey`), not positional row indices.
- Never patch external tables (`data.source`) — edits must be rejected with clear diagnostics.
- Preserve inline comments and fence structure when editing blocks.
- Errors should be explicit and stable, and include line metadata when available.

