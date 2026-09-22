---
plan_role: tracker
status: active
source_of_truth: true
owner: platform
last_reviewed: 2026-09-22
current_program_path: docs/plans/current-program.md
execution_log_path: docs/plans/2026-03-03-implementation-conformance-log.md
status_command: pnpm plan:status
---

# Current Tracker

> This is the single active tracker. Historical proof is linked, not repeated.

## Active Queue

| ID                                            | Status        | Owner                    | Work                                                                                                            | Exit Criteria                                                                                                                                       |
| --------------------------------------------- | ------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ORDINARY-DELIVERY-GATE-ORCHESTRATION-REPAIR` | `in_progress` | Codex / GPT-5.6 Sol high | Make delivery-gate authoritative and retain pr-finalizer only as the required app-pinned compatibility context. | Exact-head/trust/review equivalence, focused contracts, required proof, independent review and protected checks pass; no product or release change. |

### Current acceptance

- Base: current protected main `82cc2767e03ede3334a0378190544c66062c6ca1`, tree
  `44201c05b4e515d5ffcd446514d67cb2b16ae2f7`; it contains PR #1808 and PR #1810.
- Owned repository surface: `pr-finalizer` and `delivery-gate` workflows, delivery/feedback
  contracts and focused tests, plus this active program/tracker reconciliation.
- Preserve: exact candidate and tested-merge identity, trusted app IDs, latest run/attempt,
  annotations, substantive current-head review bodies, inline findings, unresolved threads,
  pending reviewers, pagination and fail-closed behavior. Branch protection remains unchanged.
- Forbidden: pilot product work, release scenario changes or weakening, release-candidate
  deduplication, auth/routing/domain refactors, deployment, branch-protection mutation and automatic
  merge.

## Product Queue

Product implementation is paused until this repair is delivered. Completed bounded outcomes remain
credited; queued does not mean in progress or verified.

| Outcome                                     | Status                | Direct next evidence                                                                                                   |
| ------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| S5 — member first-case journey              | `paused_open`         | Credit #1788/#1790/#1792/#1796/#1801; select only a remaining bounded gap after owner resume.                          |
| S6 — member continuation/membership         | `queued_conditional`  | Reuse delivered case workspace/detail and prove only missing return, evidence, message and membership-access outcomes. |
| S7 — staff handling                         | `queued_conditional`  | Request-bound upload, acknowledgement and fulfilment where consumed; preserve internal/public separation.              |
| S8/S9 — agent handoff and activation        | `queued_conditional`  | Established assignment, attribution, member ownership and Paddle contracts.                                            |
| S10–S12 — branch/tenant/platform operations | `queued_conditional`  | Existing role/scope contracts; no custom-role or impersonation expansion.                                              |
| H1 — SVC-CORE / Help Now                    | `priority_when_ready` | First unmet service clause plus accepted country/content/stop-rule authority.                                          |
| S13/S14 — closure and pilot rehearsal       | `queued_conditional`  | Applicable recovery/business/operations evidence, then complete role/accessibility/locale rehearsal.                   |

The [requirement disposition map](requirement-disposition-map.md) remains the complete 510-clause
SRS/frontier index. Its unresolved rows are not automatic features, deferrals or blanket blockers.

## Proof Ledger

| ID | Source Refs | Execution | Run ID | Run Root | Sonar | Docker | Sentry | Learning | Evidence Refs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `ORDINARY-DELIVERY-GATE-ORCHESTRATION-REPAIR` | owner authorization; governance audit; PR #1808; PR #1810 | pending | pending | pending | pending | not_applicable | not_applicable | pending | candidate PR and focused equivalence/review evidence pending |

## Current Facts

- PR #1808 merged as `f22127f2ebcf45b5dc64ea521dbeb298b77654be` with reviewed tree
  `f48eb434b6274ff266f9f353496410c1670ade4c`; exact-main CI, Sonar and security passed.
- The corrected immutable-preview diagnostic passed role-panel visibility against that immutable
  preview, but the original staging failure was not reproduced. Role grant/revoke P0.3/P0.4 remain
  a release-evidence gap and are neither weakened nor claimed complete by this independent repair.
- Current protected main `82cc2767e03ede3334a0378190544c66062c6ca1` includes PR #1810's
  diagnostic follow-up.
- S5 first-case saved-draft continuity completed through protected PR #1801. Whole S5 remains open.
- PR #1803 and all other pilot feature work remain outside this repair and paused by owner direction.
- No deployment, product readiness or user-acceptance claim is made here; staging and pilot
  readiness also remain unclaimed.

## Next Selection

No product successor is selected while this governance repair is active. After protected delivery,
the owner may resume one bounded product outcome from the current program. Pending status prose alone
does not create a new closeout PR or authorize product work.

## Historical Evidence

- [Prior active queue and proof ledger](history/2026-09-22-current-tracker-ledger.md)
- [Prior program and delivered-scope ledger](history/2026-09-22-current-program-ledger.md)
- [Implementation conformance log](2026-03-03-implementation-conformance-log.md)
- [Pre-Rev-243 authority manifest](history/current-authority/2026-08-16-through-rev-243.manifest.json)

Historical allocations, projections and receipts retain their original meaning but do not select or
block ordinary work. Explicit legacy validation remains available for changes to those artifacts or
their consumers.
