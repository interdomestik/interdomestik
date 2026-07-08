---
plan_role: input
status: active
source_of_truth: false
owner: product-design
last_reviewed: 2026-07-08
related:
  - docs/product/2026-07-03-business-decision-memos.md
  - docs/product/2026-07-06-business-memo-return-packet-albanian.md
  - docs/product/2026-07-06-business-memo-signature-intake.md
  - docs/product/2026-07-08-memo2-handler-sla-evidence-addendum.md
  - docs/reviews/2026-07-05-enterprise-transformation-register.md
  - docs/reviews/2026-07-05-nine-step-enterprise-sequence.md
---

# Memo 2 Decision Record — Handler Model

> Status: **reconciled input.** The original in-repo signature scaffold below is
> historical and has been superseded as the evidence target by the later signed
> Memo 2 PDF correction accepted for `MOB-02` preparation and current-authority
> review. See
> `docs/product/2026-07-08-memo2-handler-sla-evidence-addendum.md`.
>
> This record does not promote `MOB-02` or `MOB-02a`, create `MOB-DG03`,
> authorize runtime work, or approve public copy.

Use `docs/product/2026-07-06-business-memo-return-packet-albanian.md` before
signing, then accept the returned record through
`docs/product/2026-07-06-business-memo-signature-intake.md`.

## Decision To Record

Decide whether member-facing surfaces promise a named handler, a case team, or a
staged model that earns named-handler rollout by branch.

## Decider

- Accountable decider: Arben Lila unless an ops lead is delegated by name.
- Consulted before signature: product/design and staffing/ops.
- Required before: MOB-02 design assumptions and handler-copy finalization.

## Selected Option

Historical scaffold, not a current runtime authority. A later `MOB-DG03` must
map the accepted Memo 2 handler/SLA evidence into exactly one concrete read-only
slice before implementation work can start.

- [ ] A — Named handler from launch.
- [ ] B — Case team from launch, with named reviewers only where the review is
      a signature-level fact.
- [ ] C — Launch with case team; allow named-handler rollout per branch after
      branch stability and SLA thresholds are met.

## Required Fields

| Field                                   | Value                                         |
| --------------------------------------- | --------------------------------------------- |
| Stable-assignment threshold             | Not promoted; future `MOB-DG03` must decide   |
| SLA threshold and measurement period    | See 2026-07-08 addendum for prep-only values  |
| Handover-copy requirement if option A/C | Not authorized; future gate must define       |
| Staff identity/privacy note             | Signed roles exist; public use still gated    |
| Copy/layout surfaces affected           | `MH-A`, `AC-1`, messaging headers, `review.*` |

## Signature

I approve the selected handler model above and accept that member-facing copy,
Figma variants, and runtime rollout gates must remain honest to this operational
model until replaced by a later signed decision.

| Role                     | Name                                    | Signature    | Date       |
| ------------------------ | --------------------------------------- | ------------ | ---------- |
| Accountable ops decider  | Accepted via external Memo 2 correction | See addendum | 2026-07-07 |
| Product/design consulted | Accepted for prep / CA review only      | See addendum | 2026-07-07 |
| Staffing/ops consulted   | Accepted for prep / CA review only      | See addendum | 2026-07-07 |

## Completion Rule

ENT-A03 is reconciled for preparation by the accepted external Memo 2 correction,
but no runtime surface may imply a stable named handler, claim handling,
emergency coverage, 24/7 support, or SLA-backed Next Step date until a later
`MOB-DG03` promotes exactly one concrete slice with the remaining evidence.
