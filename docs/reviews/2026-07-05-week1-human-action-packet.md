---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-07-05
related:
  - docs/reviews/2026-07-05-nine-step-enterprise-sequence.md
  - docs/reviews/2026-07-05-week1-execution-packet.md
  - docs/product/2026-07-03-business-decision-memos.md
  - docs/product/2026-07-03-ks-help-now-content-dossier-draft.md
---

# Week 1 Human Action Packet

> Status: docs/ops packet only. This appoints nobody by itself, signs no memo,
> and creates no runtime authority.

## 1. KS Reviewer Appointment

**Goal:** name the person who can complete ENT-A04 / L2 KS content sign-off.

**Required record:** add reviewer name, qualification, counsel countersign path
if needed, date, and signature to
`docs/product/2026-07-03-ks-help-now-content-dossier-draft.md`.

**Message to send:**

```text
We need an L2 factual/legal review for Interdomestik's Kosovo Help Now content
before any public exposure. Please verify emergency numbers, police/EAS rules,
Green Card/border-insurance status, evidence checklist, roadside do/don't copy,
deadline statements, bilingual rendering, and native sq wording. Each row must
include source/citation, retrieval date, correction status, reviewer name,
qualification, date, and signature. No unsigned row can ship.
```

**Acceptance:** named reviewer recorded by date; if reviewer is not licensed KS
counsel, a counsel countersign path is recorded.

## 2. Memo 1 Routing

**Decision:** expert-cost-on-loss option A/B/C.

**Message to finance/counsel:**

```text
Please review Memo 1 in docs/product/2026-07-03-business-decision-memos.md.
We need a signed choice on whether Interdomestik absorbs expert/court costs
when recovery fails, and a defensible cost range/cap if the answer is A or C.
This decision blocks MOB-05a fee math and L5 wording.
```

**Acceptance:** option checked, cap/range filled, signed/date line completed,
and dated decision note added in `docs/product/`.

## 3. Memo 2 Routing

**Decision:** named handler vs. case-team model.

**Message to ops/product:**

```text
Please review Memo 2 in docs/product/2026-07-03-business-decision-memos.md.
We need a signed handler-model choice. If the answer is staged option C,
define the branch stability and SLA threshold that earns named-handler rollout.
This blocks MOB-02 design assumptions.
```

**Acceptance:** option checked, threshold filled if C, signed/date line
completed, and dated decision note added in `docs/product/`.

## 4. B6 Owner Assignment

**Needed owner:** one ops/platform person who can write and exercise the
content-pack hotfix runbook on staging.

**Acceptance:** runbook path chosen, trigger conditions written, staging exercise
run, propagation time recorded, rollback/re-darken path proven.

## 5. B7 Owner Assignment

**Needed owner:** one platform/ops person who owns Sentry/provider alert catalog
entries for `/help-now`, SW install failure, cache-guard violation, and funnel
pipeline failure.

**Acceptance:** alert-catalog doc created, synthetic staging error fired, alert
observed, and ack path recorded or linked to ENT-A07.
