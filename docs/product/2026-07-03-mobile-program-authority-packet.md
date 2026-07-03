---
plan_role: input
status: active
source_of_truth: false
owner: product-design
last_reviewed: 2026-07-03
related:
  - docs/product/mobile-experience-blueprint.md
  - docs/plans/current-program.md
  - docs/plans/current-tracker.md
  - docs/plans/architecture-finalization-program-2026-05-29.md
  - docs/plans/vonesa-architecture-integration-2026-05-30.md
  - docs/plans/2026-07-02-obr-dg40-t503-controlled-continuation-authority.md
---

# Mobile Program Authority Packet (Design/Current-Authority Input)

> Status: **Input document — design authority only.** This packet defines the governed design intent for the mobile commercial experience. It creates **no execution authority** and promotes **no slice**: every `MOB-*` item below enters the active queue only through a fresh current-authority resolution and a recorded design gate in `docs/plans/current-program.md` / `docs/plans/current-tracker.md`. If this packet conflicts with those documents, they win.

This file is the modular index for the packet. The content is split into companion files so the docs stay inside the repository modularity guard while retaining the same governance status.

## Contents

1. [Part 1](./2026-07-03-mobile-program-authority-packet-part-1.md)
2. [Part 2](./2026-07-03-mobile-program-authority-packet-part-2.md)
3. [Part 3](./2026-07-03-mobile-program-authority-packet-part-3.md)

## Governance

- `plan_role: input` and `source_of_truth: false` remain binding for this index and all parts.
- These files do not authorize runtime work, routing/auth/session/tenancy changes, billing/product UI, proxy changes, or tracker promotion.
