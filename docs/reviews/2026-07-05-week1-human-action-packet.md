---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-07-05
related:
  - docs/reviews/2026-07-05-nine-step-enterprise-sequence.md
  - docs/reviews/2026-07-06-nine-step-evidence-intake-register.md
  - docs/reviews/2026-07-07-human-dispatch-and-acceptance-packet.md
  - docs/reviews/2026-07-07-human-dispatch-message-pack-albanian.md
  - docs/reviews/2026-07-05-week1-execution-packet.md
  - docs/plans/2026-07-06-ent-a05-content-pack-hotfix-exercise-intake.md
  - docs/plans/2026-07-06-ent-a06-alert-owner-assignment-and-proof-intake.md
  - docs/plans/2026-07-06-b6-b7-ops-return-packet-albanian.md
  - docs/plans/2026-07-06-ent-a06-help-now-alert-preflight.md
  - docs/product/2026-07-03-business-decision-memos.md
  - docs/product/2026-07-06-business-memo-return-packet-albanian.md
  - docs/product/2026-07-06-business-memo-signature-intake.md
  - docs/product/2026-07-05-mk-help-now-signature-package/README.md
  - docs/product/2026-07-06-mk-reviewer-appointment-intake.md
  - docs/product/2026-07-06-mk-reviewer-return-packet-albanian.md
---

# Week 1 Human Action Packet

> Status: docs/ops packet only. This appoints nobody by itself, signs no memo,
> and creates no runtime authority.

Index returned artifacts and later corrections in
`docs/reviews/2026-07-06-nine-step-evidence-intake-register.md`.
Use `docs/reviews/2026-07-07-human-dispatch-and-acceptance-packet.md` for the
dated dispatch order and acceptance desk.
Use `docs/reviews/2026-07-07-human-dispatch-message-pack-albanian.md` for the
copy-ready Albanian messages.

## 1. MK Reviewer Appointment

**Goal:** name the person who can complete ENT-A04 / L2 North Macedonia
content sign-off.

**Required record:** add reviewer name, qualification, counsel countersign path
if needed, date, signature, scope acceptance, and evidence path to the MK
signature package introduced by PR `#1301`, then accept the returned record
through `docs/product/2026-07-06-mk-reviewer-appointment-intake.md`.

**Current candidate:** Gazmend can act as MK ops/UIUX reviewer for local trust,
workflow, wording clarity, and product-readiness rows. If he is not licensed
North Macedonia counsel, legal/factual rows still need counsel countersign.

**Reviewer-facing packet:** send
`docs/product/2026-07-06-mk-reviewer-return-packet-albanian.md` when Gazmend
needs step-by-step Albanian instructions for what to return.

**Message to send:**

```text
We need an L2 factual/legal review for Interdomestik's North Macedonia Help Now content
before any public exposure. Please verify emergency numbers, police/EAS rules,
Green Card/border-insurance status, evidence checklist, roadside do/don't copy,
deadline statements, bilingual rendering, and native sq wording. Each row must
include source/citation, retrieval date, correction status, reviewer name,
qualification, date, and signature. No unsigned row can ship.
```

**Acceptance:** named reviewer recorded by date; appointment intake accepted;
if reviewer is not licensed North Macedonia counsel, a counsel countersign path
is recorded before `ENT-A04` is marked done.

## 2. Memo 1 Routing

**Decision:** expert-cost-on-loss option A/B/C.

**Signer-facing packet:** use
`docs/product/2026-07-06-business-memo-return-packet-albanian.md` so the return
includes range, cap, finance, counsel/L5, rationale, and signature reference.

**Message to finance/counsel:**

```text
Please review Memo 1 in docs/product/2026-07-03-business-decision-memos.md.
We need a signed choice on whether Interdomestik absorbs expert/court costs
when recovery fails, and a defensible cost range/cap if the answer is A or C.
This decision blocks MOB-05a fee math and L5 wording.
```

**Acceptance:** option checked, cap/range filled, signed/date line completed,
returned record accepted by
`docs/product/2026-07-06-business-memo-signature-intake.md`, and dated decision
note added in `docs/product/`.

## 3. Memo 2 Routing

**Decision:** named handler vs. case-team model.

**Signer-facing packet:** use
`docs/product/2026-07-06-business-memo-return-packet-albanian.md` so the return
includes the model, stability/SLA thresholds where needed, handover rule,
privacy note, rationale, and signature reference.

**Message to ops/product:**

```text
Please review Memo 2 in docs/product/2026-07-03-business-decision-memos.md.
We need a signed handler-model choice. If the answer is staged option C,
define the branch stability and SLA threshold that earns named-handler rollout.
This blocks MOB-02 design assumptions.
```

**Acceptance:** option checked, threshold filled if C, signed/date line
completed, returned record accepted by
`docs/product/2026-07-06-business-memo-signature-intake.md`, and dated decision
note added in `docs/product/`.

## 4. B6 Owner Assignment

**Needed owner:** one ops/platform person who can run or request a staging
deploy, verify the Help Now route, inspect service-worker/cache behavior without
member data, and prove the re-darken/rollback path.

**Required intake:** fill
`docs/plans/2026-07-06-ent-a05-content-pack-hotfix-exercise-intake.md`.
Use `docs/plans/2026-07-06-b6-b7-ops-return-packet-albanian.md` as the
operator-facing Albanian return guide.

**Acceptance:** named B6 staging operator, staging SHA, before/after
manifest version/hash, route proof, SW/cache revalidation proof, cache-safety
proof, propagation timing, and rollback/re-darken proof. Do not pass B6 from a
runbook-only record.

## 5. B7 Owner Assignment

**Needed owner:** one platform/ops person who can inspect the configured
Sentry/provider project, review alert rules and destinations without exposing
private channels, safely trigger one provider-supported test notification, and
record acknowledgement metadata.

**Required intake:** fill
`docs/plans/2026-07-06-ent-a06-alert-owner-assignment-and-proof-intake.md`.
Use `docs/plans/2026-07-06-b6-b7-ops-return-packet-albanian.md` as the
owner-facing Albanian return guide.

**Acceptance:** named alert owner, provider/project slug, safe rule inventory,
coverage result for route/manifest/SW/cache/funnel/dark-state failure modes,
synthetic event proof, routed notification proof, and acknowledgement record.
If provider proof cannot cover the missing SW/cache/manifest/funnel/dark-state
signals, mark B7 `blocked` and request a later current-authority instrumentation
slice. Do not pass B7 from route-error coverage alone.
