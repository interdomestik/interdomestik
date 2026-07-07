---
plan_role: input
status: draft
source_of_truth: false
owner: platform
last_reviewed: 2026-07-05
related:
  - docs/reviews/2026-07-05-enterprise-transformation-register.md
  - docs/reviews/2026-07-05-target-state-enterprise-readiness-audit.md
  - docs/reviews/2026-07-06-nine-step-evidence-intake-register.md
  - docs/reviews/2026-07-07-human-dispatch-and-acceptance-packet.md
  - docs/reviews/2026-07-07-human-dispatch-message-pack-albanian.md
  - docs/plans/2026-07-03-t503-drop-claim-status-closeout.md
  - docs/plans/2026-07-06-ent-a05-content-pack-hotfix-exercise-intake.md
  - docs/plans/2026-07-06-ent-a06-alert-owner-assignment-and-proof-intake.md
  - docs/plans/2026-07-06-b6-b7-ops-return-packet-albanian.md
  - docs/plans/2026-07-06-ent-a06-help-now-alert-preflight.md
  - docs/product/2026-07-05-mk-help-now-signature-package/README.md
  - docs/product/2026-07-06-mk-reviewer-appointment-intake.md
  - docs/product/2026-07-06-mk-reviewer-return-packet-albanian.md
  - docs/product/2026-07-03-business-decision-memos.md
  - docs/product/2026-07-06-business-memo-return-packet-albanian.md
  - docs/product/2026-07-06-business-memo-signature-intake.md
---

# Week-1 Execution Packet — ENT-A01 … ENT-A06 - Part 1

Back to index: [2026-07-05-week1-execution-packet.md](./2026-07-05-week1-execution-packet.md)

# Week-1 Execution Packet — ENT-A01 … ENT-A06

> Status: **Execution input — docs/ops work only.** Every item in this packet is Gate=`none` except where noted; nothing here starts runtime implementation. Owner naming note: Arben Lila is the accountable owner of record for every item until he delegates by name — the packet marks where an external appointment (counsel, reviewer) is itself the first task. §5 states the authority boundary precisely.

Returned artifacts and later corrections are indexed in
`docs/reviews/2026-07-06-nine-step-evidence-intake-register.md`.
The 2026-07-07 human dispatch order is
`docs/reviews/2026-07-07-human-dispatch-and-acceptance-packet.md`.
The copy-ready Albanian message pack is
`docs/reviews/2026-07-07-human-dispatch-message-pack-albanian.md`.

---

## 1. ENT-A01 — B2: Staging RBAC/Role-Marker Residual Check

- **Owner:** Arben Lila (accountable + executing; PLAT).
- **Evidence file to update:** `docs/plans/2026-07-05-b2-staging-rbac-residual-check.md`.
- **Target:** 2026-07-10.
- **Reviewer:** none required (verification record, not a change) — but link it from the register row and the next current-authority resolution.
- **Blocker if not completed:** every launch-track decision (audit stop-condition 6); ENT-A15 stays `blocked`.

### What is being checked (the residual, precisely)

From `2026-07-03-t503-drop-claim-status-closeout.md`: after the T-503 merge (main SHA `45cc038b`), CD run `28699456479` passed build/deploy-staging, but **`e2e-staging` failed twice** — attempt 1 (job `85115834639`): **P0.1 role-marker failures on agent and staff staging routes after successful login**; attempt 2 (job `85116379208`): **P0.1 agent marker missing + P0.3 role-add failure**. Rev 89 classifies this as deployment-smoke residual: a launch/live-operationality blocker **only if it reproduces on current main/staging** — several PRs have merged since (`#1287`–`#1298`), so it may already be healed or may be a real staging RBAC defect.

### Procedure

**Environment:** the staging deployment of current `main` (redeploy first if staging is behind main — the check is meaningless against a stale deploy). Record the deployed SHA in the evidence file.

**Roles/sessions tested:** (1) agent login → `/agent`; (2) staff login → `/staff`; (3) the P0.3 role-add flow (the admin/role-grant path the failing spec exercises); (4) member and admin as controls (they passed before — confirm they still do).

**Pass/fail signal:** the canonical page-ready **role markers** on `/agent` and `/staff` after authenticated navigation — the same contractual markers the P0.1 staging specs assert. Residual **reproduced** = marker absent/timeout after successful login on current staging. Residual **closed** = both attempts green.

**Steps:**

1. Confirm staging is on current main; redeploy via the CD workflow if not. Record run URL + SHA.
2. Re-run the failing lane: re-run the `e2e-staging` job on the latest CD run (GitHub → Actions → CD → re-run job), or `gh run rerun <run-id> --job e2e-staging` if job-level rerun is available.
3. Run it twice (the original failed differently on attempts 1 and 2 — flake vs. defect is part of the question).
4. If red: pull the Playwright report artifact; capture the failing spec names, marker selectors, screenshots/traces from the report; note whether failures match the original signature (agent/staff P0.1, P0.3 role-add) or differ.
5. Optional local corroboration if CI results are ambiguous: run the staging-targeted P0 specs from `apps/web` against the staging URL with staging auth state (the repo's staging e2e lane configuration), and attach output.

**Evidence captured in the record:** deployed SHA + CD run URLs; both re-run job URLs with pass/fail; on failure — spec names, marker assertions, screenshots/trace refs, and the signature comparison; on success — the two green job links. Close with one of two dated verdicts:

- **CLOSED:** "Residual not reproduced on `main@{sha}`, two consecutive green `e2e-staging` runs ({job URLs})." → register row A01 → `done(path)`; A15 unblocks (pending A04/A05/A06).
- **REPRODUCED:** "Residual reproduced ({signature})." → launch track halted per stop-condition 6; the fix becomes the next current-authority candidate (architecture lane, not MOB); register A01 → `blocked(fix-slice)`.

### Acceptance criteria

Two same-day `e2e-staging` executions against current-main staging, both dispositioned; the evidence file exists with URLs (not screenshots of URLs); a one-line verdict usable verbatim by the next current-authority resolution.

---

## 2. ENT-A02 — Sign Memo 1 (Expert-Cost-on-Loss)

- **Owner:** Arben Lila (decider, as managing director). Consulted: counsel (when L5 owner appointed), finance (Arben acting until delegated).
- **Evidence file:** completed decision block inside `docs/product/2026-07-03-business-decision-memos.md` (Memo 1) **plus** `docs/product/2026-07-06-business-memo-return-packet-albanian.md`, a dated decision note `docs/product/2026-07-XX-memo1-decision.md` (one paragraph: option, cap, rationale), and return acceptance in `docs/product/2026-07-06-business-memo-signature-intake.md`.
- **Engineering:** none.
- **Acceptance criteria:** option box checked (A/B/C), cap amount if A/C, signature + date; the "finance to quantify" cost estimate filled with at least a defensible range; memo-signature intake accepted; decision note committed.
- **Reviewer:** counsel reads the chosen option's wording implications before L5 kickoff (ENT-A17) — the decision itself needs no reviewer.
- **Target:** 2026-07-17. **Blocker if missed:** MOB-05a (ENT-B01) cannot enter its gate; the Fee Math Sheet promise line stays unbuildable.

## 3. ENT-A03 — Sign Memo 2 (Handler Model)

- **Owner:** Arben Lila (as ops lead of record; delegate to the actual claims-ops lead if distinct).
- **Evidence file:** completed decision block in Memo 2 + `docs/product/2026-07-06-business-memo-return-packet-albanian.md`, `docs/product/2026-07-XX-memo2-decision.md`, and return acceptance in `docs/product/2026-07-06-business-memo-signature-intake.md`.
- **Engineering:** none. Input needed: an honest one-line answer to "can we guarantee stable assignment ≥90% today?" — if the answer requires thought, the answer is no, which is exactly what option C is for.
- **Acceptance criteria:** option checked (recommended: C), stability threshold defined if C, signed + dated, memo-signature intake accepted.
- **Reviewer:** product/design (affects MOB-02/ceremony Figma layouts).
- **Target:** 2026-07-17. **Blocker if missed:** MOB-02 design work (Figma sprint scope) proceeds two-tracked or stalls.

## 4. ENT-A04 — L2 MK Content Sign-Off (workflow defined in §4 below)

- **Owner:** Arben Lila (accountable); **executing reviewer: a licensed North Macedonia lawyer or the MK operations lead with counsel access — appointing this person by name is the day-1 subtask** (target for appointment: 2026-07-08).
- **Evidence file:** completed MK signature package introduced by PR `#1301`, plus `docs/product/2026-07-06-mk-reviewer-appointment-intake.md` and `docs/product/2026-07-06-mk-reviewer-return-packet-albanian.md`, with returned signed PDFs preserved and a content-pack hash recorded before any non-dark exposure.
- **Target:** 2026-07-26. **Blocker if missed:** MOB-01b unreachable; August corridor at risk; the fallback (MOB-05a first) activates per the audit §5.

## 5. ENT-A05 — B6: Content-Pack Hotfix Runbook

- **Owner:** Arben Lila (OPS of record); executing: whoever runs staging deploys today.
- **Evidence file:** `docs/manual/runbook-content-pack-hotfix.md` (or the repo's runbook home) + an exercise record appended to it.
- **Owner intake:** `docs/plans/2026-07-06-ent-a05-content-pack-hotfix-exercise-intake.md`.
- **Operator return guide:** `docs/plans/2026-07-06-b6-b7-ops-return-packet-albanian.md`.
- **Engineering involved:** one staging exercise — publish a deliberately-corrected test pack version, verify: manifest version/hash changes, stale SW cache revalidates, cache contains public Help Now assets only, and dark/re-darken works both directions. Commands: the pack manifest/flag mechanism shipped in PR `#1296` — exercise via the same config change process that MOB-01 used, on staging only.
- **Acceptance criteria:** runbook states trigger conditions (wrong emergency number = severity 1), exact steps, expected propagation time, verification step, and rollback (re-darken); owner intake names the B6 operator; exercise record shows measured propagation time on staging. Runbook-only proof cannot pass B6.
- **Reviewer:** platform engineer who merged `#1296`.
- **Target:** 2026-07-20. **Blocker if missed:** non-dark launch blocked (launch blocker B6) even with L2 signed.

## 6. ENT-A06 — B7: Alert Coverage for `/help-now`

- **Owner:** Arben Lila (PLAT of record).
- **Evidence file:** new entry in the `ent-alert*` catalog lineage: `docs/plans/ent-alert15-help-now-public-surface-alert-coverage-2026-07-XX.md`.
- **Owner intake:** `docs/plans/2026-07-06-ent-a06-alert-owner-assignment-and-proof-intake.md`.
- **Owner return guide:** `docs/plans/2026-07-06-b6-b7-ops-return-packet-albanian.md`.
- **Preflight:** `docs/plans/2026-07-06-ent-a06-help-now-alert-preflight.md` currently blocks B7 because route/server errors may be observable, but SW/cache/manifest/funnel/dark-state coverage is not proven.
- **Engineering involved:** named alert owner inspects Sentry/provider coverage first; only if provider proof cannot cover required modes should a later current-authority instrumentation slice be requested.
- **Checks:** provider/project slug recorded; safe rule inventory recorded; synthetic event fired from staging or provider-supported test path; routed notification observed; acknowledgement metadata recorded; no secrets/PII/private destinations stored in repo.
- **Acceptance criteria:** owner intake and dated proof record list route, manifest, service-worker, cache, funnel, and dark-state coverage. Route-error coverage alone cannot pass B7.
- **Reviewer:** named B7 alert owner plus accountable program owner.
- **Target:** 2026-07-15. **Blocker if missed:** non-dark launch blocked (B7) — a silently broken emergency surface is worse than none.

---
