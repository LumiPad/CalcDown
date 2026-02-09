# Makefiles — Agent Instructions

Scope: `make/**`.

## Style

- Keep Makefiles modular (`Makefile` includes `.mk` files from `make/`).
- Every public target should have a `##` help description so `make help` stays useful.
- Prefer portable commands; avoid platform-specific assumptions when possible.

## Expected targets

- `make build`, `make typecheck`, `make analyze`, `make source-check`, `make agents-check`, `make demo-check`, `make test`, `make check`, `make conformance`, `make verify`, `make demo`
