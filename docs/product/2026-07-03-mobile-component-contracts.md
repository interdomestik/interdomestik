---
plan_role: input
status: draft
source_of_truth: false
owner: product-design
last_reviewed: 2026-07-03
related:
  - docs/product/2026-07-03-mobile-program-authority-packet.md
  - docs/product/mobile-experience-blueprint.md
---

# Mobile UX Primitive Component Contracts

> Status: **Design contracts only — no implementation authorized.** These contracts fix the props, states, invariants, and accessibility duties of the mobile primitives so that promoted slices build against a stable design API. TypeScript is used as contract notation, not as shipped code. Each contract names the slice that may first implement it; implementing a contract before its slice is promoted is a governance violation, not a head start.

This file is the modular index for the packet. The content is split into companion files so the docs stay inside the repository modularity guard while retaining the same governance status.

## Contents

1. [Part 1](./2026-07-03-mobile-component-contracts-part-1.md)
2. [Part 2](./2026-07-03-mobile-component-contracts-part-2.md)
3. [Part 3](./2026-07-03-mobile-component-contracts-part-3.md)

## Governance

- `plan_role: input` and `source_of_truth: false` remain binding for this index and all parts.
- These files do not authorize runtime work, routing/auth/session/tenancy changes, billing/product UI, proxy changes, or tracker promotion.
