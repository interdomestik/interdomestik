---
plan_role: input
status: draft
source_of_truth: false
owner: product-design
last_reviewed: 2026-07-05
related:
  - docs/product/2026-07-03-business-decision-memos.md
  - docs/reviews/2026-07-05-enterprise-transformation-register.md
  - docs/reviews/2026-07-05-nine-step-enterprise-sequence.md
---

# Memo 2 Decision Record — Handler Model

> Status: **signature record only.** This file is not signed and does not choose
> an option. It is the evidence target for ENT-A03 after the ops decider
> completes Memo 2 in `docs/product/2026-07-03-business-decision-memos.md`.

## Decision To Record

Decide whether member-facing surfaces promise a named handler, a case team, or a
staged model that earns named-handler rollout by branch.

## Decider

- Accountable decider: Arben Lila unless an ops lead is delegated by name.
- Consulted before signature: product/design and staffing/ops.
- Required before: MOB-02 design assumptions and handler-copy finalization.

## Selected Option

Mark exactly one:

- [ ] A — Named handler from launch.
- [ ] B — Case team from launch, with named reviewers only where the review is
      a signature-level fact.
- [ ] C — Launch with case team; allow named-handler rollout per branch after
      branch stability and SLA thresholds are met.

## Required Fields

| Field                                   | Value                                         |
| --------------------------------------- | --------------------------------------------- |
| Stable-assignment threshold             | `TBD`                                         |
| SLA threshold and measurement period    | `TBD`                                         |
| Handover-copy requirement if option A/C | `TBD`                                         |
| Staff identity/privacy note             | `TBD`                                         |
| Copy/layout surfaces affected           | `MH-A`, `AC-1`, messaging headers, `review.*` |

## Signature

I approve the selected handler model above and accept that member-facing copy,
Figma variants, and runtime rollout gates must remain honest to this operational
model until replaced by a later signed decision.

| Role                     | Name  | Signature | Date  |
| ------------------------ | ----- | --------- | ----- |
| Accountable ops decider  | `TBD` | `TBD`     | `TBD` |
| Product/design consulted | `TBD` | `TBD`     | `TBD` |
| Staffing/ops consulted   | `TBD` | `TBD`     | `TBD` |

## Completion Rule

ENT-A03 is not done until this file has one selected option, thresholds filled
where applicable, and the accountable ops signature dated. If option B is chosen,
no surface may imply a stable named handler. If option C is chosen, named-handler
copy may render only after the branch earns it.
