---
plan_role: tracker
status: active
source_of_truth: true
owner: platform
last_reviewed: 2026-09-23
current_program_path: docs/plans/current-program.md
execution_log_path: docs/plans/2026-03-03-implementation-conformance-log.md
status_command: pnpm plan:status
---

# Current Tracker

> This is the single active tracker. Historical proof is linked, not repeated.

## Active Queue

| ID                                   | Status        | Owner                    | Work                                                                                              | Exit Criteria                                                                                                                                 |
| ------------------------------------ | ------------- | ------------------------ | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `REQUEST-LINKED-EVIDENCE-ROUND-TRIP` | `in_progress` | Codex / GPT-5.6 Sol high | Bind member evidence to one open request and let only assigned staff acknowledge the association. | Durable tenant-safe association and audit, retry safety, localized UI, focused proof, independent review and protected checks; no deployment. |

### Current acceptance

- Base: current protected main `f12afb769fc555c3e33ba7064331e7276de58eb2`; it contains the
  completed governance, delivery simplification, domain coverage and release-deduplication work
  through PR #1813.
- Owned repository surface: request/document persistence, upload intent and confirmation, claim
  domain actions, member/staff request UI, locale messages, focused proof and this authority update.
- Preserve: request remains open; claim lifecycle and SLA state remain unchanged; existing document
  authorization, canonical routing, authentication and tenant boundaries remain authoritative.
- Forbidden: request fulfilment semantics, claim lifecycle or SLA changes, proxy/routing/auth
  refactors, deployment and live-data mutation.

## Product Queue

Product implementation resumed for the single bounded request-linked evidence dependency. Completed
bounded outcomes remain credited; queued does not mean in progress or verified.

| Outcome                                     | Status                | Direct next evidence                                                                                                   |
| ------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| S5 — member first-case journey              | `active_bounded`      | Request-linked member evidence upload is active; credit #1788/#1790/#1792/#1796/#1801.                                 |
| S6 — member continuation/membership         | `queued_conditional`  | Reuse delivered case workspace/detail and prove only missing return, evidence, message and membership-access outcomes. |
| S7 — staff handling                         | `active_bounded`      | Assigned-staff acknowledgement is active; fulfilment remains open and separate.                                        |
| S8/S9 — agent handoff and activation        | `queued_conditional`  | Established assignment, attribution, member ownership and Paddle contracts.                                            |
| S10–S12 — branch/tenant/platform operations | `queued_conditional`  | Existing role/scope contracts; no custom-role or impersonation expansion.                                              |
| H1 — SVC-CORE / Help Now                    | `priority_when_ready` | First unmet service clause plus accepted country/content/stop-rule authority.                                          |
| S13/S14 — closure and pilot rehearsal       | `queued_conditional`  | Applicable recovery/business/operations evidence, then complete role/accessibility/locale rehearsal.                   |

The [requirement disposition map](requirement-disposition-map.md) remains the complete 510-clause
SRS/frontier index. Its unresolved rows are not automatic features, deferrals or blanket blockers.

## Proof Ledger

| ID | Source Refs | Execution | Run ID | Run Root | Sonar | Docker | Sentry | Learning | Evidence Refs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `REQUEST-LINKED-EVIDENCE-ROUND-TRIP` | owner authorization; protected main through PR #1813 | pending | pending | pending | pending | not_applicable | not_applicable | pending | candidate PR persistence/domain/UI/E2E and independent review evidence pending |

## Current Facts

- PR #1808 merged as `f22127f2ebcf45b5dc64ea521dbeb298b77654be` with reviewed tree
  `f48eb434b6274ff266f9f353496410c1670ade4c`; exact-main CI, Sonar and security passed.
- The corrected immutable-preview diagnostic passed role-panel visibility against that immutable
  preview, but the original staging failure was not reproduced. Role grant/revoke P0.3/P0.4 remain
  a release-evidence gap and are neither weakened nor claimed complete by this independent repair.
- Current protected main `f12afb769fc555c3e33ba7064331e7276de58eb2` includes delivery
  simplification, domain coverage enforcement and release-check deduplication through PR #1813.
- S5 first-case saved-draft continuity completed through protected PR #1801. Whole S5 remains open.
- The owner resumed the bounded request-linked evidence and acknowledgement dependency; request
  fulfilment and all unrelated pilot work remain outside this slice.
- No deployment, product readiness or user-acceptance claim is made here; staging and pilot
  readiness also remain unclaimed.

## Next Selection

No successor is selected while this product slice is active. After protected delivery, the owner
may select one bounded outcome from the current program. Pending status prose alone does not create
a new closeout PR or authorize unrelated product work.

## Historical Evidence

- [Prior active queue and proof ledger](history/2026-09-22-current-tracker-ledger.md)
- [Prior program and delivered-scope ledger](history/2026-09-22-current-program-ledger.md)
- [Implementation conformance log](2026-03-03-implementation-conformance-log.md)
- [Pre-Rev-243 authority manifest](history/current-authority/2026-08-16-through-rev-243.manifest.json)

Historical allocations, projections and receipts retain their original meaning but do not select or
block ordinary work. Explicit legacy validation remains available for changes to those artifacts or
their consumers.
