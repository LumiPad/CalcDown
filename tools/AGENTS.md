# Tools — Agent Instructions

Scope: `tools/**`.

This folder contains lightweight helper scripts used by `make` targets.

## Goals

- Keep scripts dependency-free and offline-friendly.
- Prefer stable, deterministic output suitable for version control and CI.

## Rules

- Avoid writing outside `build/` unless explicitly intended.
- Keep CLIs small and explicit; include `--help`/usage text for new scripts.
