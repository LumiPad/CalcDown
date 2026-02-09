# Stdlib — Agent Instructions

Scope: `src/stdlib/**`.

This folder implements CalcDown’s standard library as `std.*`, used by CalcScript during evaluation.

## Goals

- Pure, deterministic functions suitable for offline/browser-first execution.
- Stable semantics: avoid breaking changes to existing behavior.
- High test coverage (thresholds are enforced).

## Rules

- No I/O: do not read files, access the network, or depend on process environment.
- No ambient time/randomness: time functions must use the provided runtime context (when applicable).
- Inputs are untrusted: validate arguments and fail with clear, stable messages.
- Keep implementations small and auditable; avoid adding dependencies.

