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

| ID                                           | Status        | Owner                    | Work                                                                                                                | Exit Criteria                                                                                                                    |
| -------------------------------------------- | ------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `ORDINARY-DELIVERY-CURRENT-AUTHORITY-REPAIR` | `in_progress` | Codex / GPT-5.6 Sol high | Compact active authority; separate ordinary and legacy validation; align review/model guidance and the local skill. | Focused contracts, required local proof, independent review and protected PR checks pass; no pilot feature, merge or deployment. |

### Current acceptance

- Base: exact main `c7c643acdaf0371e29fa01526dd638decf779b77`, tree
  `6048c5be747155adaa10eed1366056a6233be941`; predecessor exact-main checks passed.
- Owned repository surface: `AGENTS.md`, `code_review.md`, active/historical program and tracker,
  current plan/authority validators and tests, focused legacy-selection/CI contracts, necessary
  package scripts and workflow parity data.
- Separately owned local surface: `/Users/arbenlila/.codex/skills/interdomestik/SKILL.md`.
  The repository PR records but does not distribute that installation-local change.
- Forbidden: pilot product implementation, finalizer/delivery polling consolidation,
  release-candidate deduplication, broad verification redesign, auth/routing/domain refactors,
  deployment and automatic merge.

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
| `ORDINARY-DELIVERY-CURRENT-AUTHORITY-REPAIR` | owner authorization; governance audit; PR #1807 | pending | pending | pending | pending | not_applicable | not_applicable | pending | candidate PR and local-skill delta pending |

## Current Facts

- PR #1807 is merged and exact-main healthy. Its accounting and closeout reduction is effective.
- S5 first-case saved-draft continuity completed through protected PR #1801. Whole S5 remains open.
- PR #1803 and all other pilot feature work remain outside this repair and paused by owner direction.
- No deployment, product readiness or user-acceptance claim is made here.

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
