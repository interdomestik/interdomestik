---
status: accepted
date: 2026-05-17
owner: platform
---

# Core Module Naming Convention

## Context

The repo had two active extraction names:

- `*.core.ts`, used broadly across actions, lib modules, and feature code.
- `_core.ts`, used mostly in Next.js route segments and API route folders.

At this point `*.core.ts` has the larger adoption footprint and is easier to scan next to sibling
entrypoints such as `page.tsx`, `route.ts`, and action wrappers.

## Decision

New extracted core modules use `*.core.ts`.

Existing `_core.ts` files are treated as legacy route-local modules. They are frozen in
`scripts/ci/core-module-legacy-allowlist.json`; `pnpm check:architecture-boundaries` fails if a new
unlisted `_core.ts` file is added.

## Consequences

- New work has one forward naming convention.
- Existing route-local modules do not need a risky mass rename during pilot delivery.
- Future cleanup can migrate allowlisted `_core.ts` files in small batches and remove each path from
  the allowlist as it moves.
