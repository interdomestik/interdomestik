---
plan_role: tracker
status: active
source_of_truth: true
owner: platform
last_reviewed: 2026-09-25
current_program_path: docs/plans/current-program.md
execution_log_path: docs/plans/2026-03-03-implementation-conformance-log.md
status_command: pnpm plan:status
---

# Current Tracker

> This is the single active tracker. Historical proof is linked, not repeated.

## Active Queue

| ID                          | Status        | Owner                   | Work                                                                              | Exit Criteria                                                                                               |
| --------------------------- | ------------- | ----------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `S6-MEMBER-CHECKOUT-REVIEW` | `in_progress` | Codex integration owner | Show existing plan/entity review to signed-in self-service members before Paddle. | Focus/cancel/reselect/retry/query-isolation proof; protected verification and exact-main automatic staging. |

### Current acceptance

- Base: protected main `c020c20c685c6cf5dbf2ae2569eb35eb6deca62c`; #1824 is staging-delivered.
- Standard/family selection shows the existing review before any checkout initialization.
- Cancel before continuation opens no checkout and restores CTA focus; reselect and deliberate retry retain the exact selected plan. Checkout initialization locks cancel, continue and plan changes.
- Existing identity/entity configuration survives review; ambient query values cannot replace it.
- Existing EN/SQ/MK/SR copy, anonymous OTP, assisted business, pending-session and pilot controls remain.
- This is presentation-only review, not terms acceptance, an entity snapshot, live activation or whole S6.
- No proxy/auth, tenancy, schema, pricing, production or guard bypass changes.

## Product Queue

| Outcome                                     | Status                | Direct next evidence                                                                                                                                             |
| ------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S5 — member first-case journey              | `active_bounded`      | Credit #1801/#1803/#1814/#1817/#1822 and #1823 staging recovery; fresh-account activation and whole S5 remain open.                                              |
| S6 — member continuation/membership         | `active_bounded`      | Deliver member checkout review; credit #1815 disclosure and #1824 retry; approved versioned offer, acceptance/snapshot, live activation and renewal remain open. |
| S7 — staff handling                         | `delivered_bounded`   | Credit #1814 assigned-staff acknowledgement; fulfilment and whole S7 remain open.                                                                                |
| S8/S9 — agent handoff and activation        | `queued_conditional`  | Established assignment, attribution, ownership and Paddle contracts.                                                                                             |
| S10–S12 — branch/tenant/platform operations | `queued_conditional`  | Existing role/scope contracts; no custom-role or impersonation expansion.                                                                                        |
| H1 — SVC-CORE / Help Now                    | `priority_when_ready` | First unmet service clause and accepted country/content/stop-rule authority.                                                                                     |
| S13/S14 — closure and pilot rehearsal       | `queued_conditional`  | Applicable recovery/business/operations evidence and complete role/accessibility/locale rehearsal.                                                               |

The [requirement disposition map](requirement-disposition-map.md) preserves the full 510-clause
frontier. Unresolved rows are neither automatic features nor blanket blockers.

## Proof Ledger

| ID                          | Source Refs                                             | Execution  | Run ID  | Run Root                           | Sonar   | Docker         | Sentry         | Learning | Evidence Refs                                                                                            |
| --------------------------- | ------------------------------------------------------- | ---------- | ------- | ---------------------------------- | ------- | -------------- | -------------- | -------- | -------------------------------------------------------------------------------------------------------- |
| `S6-MEMBER-CHECKOUT-REVIEW` | owner continuation; bounded IDA-MEM-005; main `c020c20` | `scripted` | pending | focused mounted review regressions | pending | not_applicable | not_applicable | pending  | apps/web/src/components/pricing/pricing-table*.test.tsx; apps/web/e2e/gate/subscription-contract.spec.ts |

## Current Facts

- #1824 protected-merged at `c020c20c685c6cf5dbf2ae2569eb35eb6deca62c`; reviewed head `495b6cb`
  and main share tree `28d8151d3a73312a6f1c7e1d42e4e27928258495`. Required checks and strict review
  readiness passed; hosted run `36121982288` passed 292 gate and 24 smoke tests.
- Automatic staging CD `36124511981` passed health/provenance and P0.1/P0.2/P0.3/P0.4/P0.6
  on exact main `c020c20`; production jobs were skipped. See the
  [bounded delivery receipt](https://github.com/interdomestik/interdomestik/pull/1824#issuecomment-5831196011).
- #1824 proves exact verified entity-routed retry after out-of-order evidence. It does not prove
  live activation, generic anonymous replay, whole IDA-MEM-006/007 or offer/terms snapshots.
- #1823 exact-main staging repaired readiness and completed #1822 saved-draft continuation.
  #1801 active-member submit/reopen, #1803 real-OTP save/return/delete/isolation, #1814 upload/staff
  acknowledgement, #1815 membership disclosure and #1817 local disclosure remain credited.
- G06 ratifies historical T-503 continuation. Its referenced MINSAS/MK sources do not establish a
  current approved Paddle pilot offer/version and conflict with current payment/refund behavior.
  Approved versioned offer/entity/terms evidence remains a business dependency for capture.
- Owner reconfirmed Paddle-only. Provider approval for actual paid services, MK webhook secret and
  deployed entity-token `customer.read` permission remain unresolved/unverified external evidence.
- Current candidate is not yet verified, merged, staged or user-accepted.
  No deployment, product readiness or user-acceptance claim follows from preparation. No production changes.

## Next Selection

Complete this bounded review improvement through one protected product PR and exact-main automatic
staging. Hand off the approved offer/terms, durable snapshot and live activation gaps without starting
another slice. Browser success never grants membership; do not substitute synthetic entitlement.
Final merge/staging facts may be reconciled in the next ordinary authorized product amendment;
no status-only PR is required.

## Historical Evidence

- [Prior active queue and proof ledger](history/2026-09-22-current-tracker-ledger.md)
- [Prior program and delivered-scope ledger](history/2026-09-22-current-program-ledger.md)
- [Implementation conformance log](2026-03-03-implementation-conformance-log.md)
- [Pre-Rev-243 authority manifest](history/current-authority/2026-08-16-through-rev-243.manifest.json)

Historical allocations, projections and receipts retain their original meaning but do not select or
block ordinary work. Explicit legacy validation remains available for changes to those artifacts or
their consumers.
