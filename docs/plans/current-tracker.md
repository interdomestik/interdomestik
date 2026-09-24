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

| ID                                   | Status        | Owner                    | Work                                                                                                              | Exit Criteria                                                                                                                                           |
| ------------------------------------ | ------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `S6-MEMBER-MEMBERSHIP-ACCESS-STATUS` | `in_progress` | Codex / GPT-5.6 Sol high | Show canonical membership lifecycle, current-period end and its new-case access consequence on the member portal. | Tenant/member-safe projection, shared access derivation, localized error/retry and allowed/denied UI, focused/E2E proof, independent review and checks. |

### Current acceptance

- Base: current protected main `af191e71da589307a21df2a7fce14380a1fdd625`; it includes the
  protected PR #1814 request-linked evidence and acknowledgement predecessor.
- Owned repository surface: the existing member membership projection, member portal continuation
  UI, EN/SQ/MK/SR catalog entries, focused/E2E proof and this authority update.
- Preserve: canonical lifecycle and access derivation, Paddle-only billing, routing, authentication
  and tenant boundaries; align every permitted portal consumer with the claim-entry access gate.
- Forbidden: offer/price/activation/renewal invention, request fulfilment, claim lifecycle or SLA
  changes, proxy/routing/auth/schema/billing refactors, production deployment and live-data mutation.

## Product Queue

Product implementation continues with one bounded S6 membership/access disclosure. Completed
bounded outcomes remain credited; queued does not mean in progress or verified.

| Outcome                                     | Status                | Direct next evidence                                                                                                 |
| ------------------------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------- |
| S5 — member first-case journey              | `delivered_bounded`   | Credit #1788/#1790/#1792/#1796/#1801 and request-linked member upload in protected #1814; whole S5 remains open.     |
| S6 — member continuation/membership         | `active_bounded`      | Canonical lifecycle/current-period/access disclosure is active; whole S6, offer, activation and renewal remain open. |
| S7 — staff handling                         | `delivered_bounded`   | Credit assigned-staff acknowledgement in protected #1814; fulfilment and whole S7 remain open.                       |
| S8/S9 — agent handoff and activation        | `queued_conditional`  | Established assignment, attribution, member ownership and Paddle contracts.                                          |
| S10–S12 — branch/tenant/platform operations | `queued_conditional`  | Existing role/scope contracts; no custom-role or impersonation expansion.                                            |
| H1 — SVC-CORE / Help Now                    | `priority_when_ready` | First unmet service clause plus accepted country/content/stop-rule authority.                                        |
| S13/S14 — closure and pilot rehearsal       | `queued_conditional`  | Applicable recovery/business/operations evidence, then complete role/accessibility/locale rehearsal.                 |

The [requirement disposition map](requirement-disposition-map.md) remains the complete 510-clause
SRS/frontier index. Its unresolved rows are not automatic features, deferrals or blanket blockers.

## Proof Ledger

| ID | Source Refs | Execution | Run ID | Run Root | Sonar | Docker | Sentry | Learning | Evidence Refs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `S6-MEMBER-MEMBERSHIP-ACCESS-STATUS` | owner authorization; protected main through PR #1814 | pending | pending | pending | pending | not_applicable | not_applicable | pending | candidate PR domain/UI/E2E and independent security review evidence pending |

## Current Facts

- Staging artifact `staging-verification-35784351048` from successful CD run #35784351048 proves the
  exercised P0.3/P0.4 staging boundary on exact SHA `c8f8834434a64962f042356721fa7657f7cc6253`.
  It is not production evidence, pilot admission or user acceptance.
- PR #1814 merged as `af191e71da589307a21df2a7fce14380a1fdd625`; exact-main CI,
  security, CodeQL and Sonar passed. Automatic CD run #35901050682 successfully built, deployed and
  verified staging; all production jobs were skipped.
- S5 first-case saved-draft continuity completed through protected PR #1801. Whole S5 remains open.
- PR #1814 also completed the bounded request-linked member upload and assigned-staff
  acknowledgement predecessor. Request fulfilment, claim lifecycle and SLA behavior remain open.
- The owner selected the bounded S6 lifecycle/current-period/access disclosure as its successor.
- Provider confirmation (`IDA-MEM-006`) and webhook/payment readiness are not proved by this display
  slice and remain outside it; no production billing configuration or incident conclusion is made.
- No deployment, product readiness or user-acceptance claim is made here; this bounded change does
  not authorize production release or claim whole-program readiness.

## Next Selection

`S6-MEMBER-MEMBERSHIP-ACCESS-STATUS` is the selected successor and remains the only active product
slice. After protected delivery, the owner may select one bounded outcome from the current program.
Pending status prose alone does not create a new closeout PR or authorize unrelated product work.

## Historical Evidence

- [Prior active queue and proof ledger](history/2026-09-22-current-tracker-ledger.md)
- [Prior program and delivered-scope ledger](history/2026-09-22-current-program-ledger.md)
- [Implementation conformance log](2026-03-03-implementation-conformance-log.md)
- [Pre-Rev-243 authority manifest](history/current-authority/2026-08-16-through-rev-243.manifest.json)

Historical allocations, projections and receipts retain their original meaning but do not select or
block ordinary work. Explicit legacy validation remains available for changes to those artifacts or
their consumers.
