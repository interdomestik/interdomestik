---
status: accepted
date: 2026-05-17
owner: platform
---

# Legacy Route Freeze

## Context

The canonical pilot routes are `/member`, `/agent`, `/staff`, and `/admin`. The repo still carries
`/[locale]/legacy/*` pages because current E2E gates assert those surfaces and their legacy banners.

Removing those pages in the same branch as tenancy or routing guardrail work would force a gate
contract change and make the review larger than necessary.

## Decision

The legacy route surface is frozen.

Existing files are tracked in `scripts/ci/legacy-route-allowlist.json`, and
`pnpm check:architecture-boundaries` fails if a new file is added under
`apps/web/src/app/[locale]/legacy/**`.

## Consequences

- New product work must target canonical routes.
- Existing E2E contracts remain stable for pilot delivery.
- A future route-removal slice can delete the allowlisted files and update the legacy-specific E2E
  assertions in one focused change.
