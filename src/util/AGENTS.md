# Util — Agent Instructions

Scope: `src/util/**`.

This folder contains small, shared utilities (dates, CSV parsing, formatting helpers).

## Goals

- Deterministic behavior across platforms and locales.
- Dependency-free, small, and easy to audit.

## Rules

- Avoid locale-dependent output unless explicitly requested by the caller.
- Be explicit about timezone handling (prefer UTC and ISO formats).
- When changing parsers/formatters, add tests for edge cases and round-trips.

