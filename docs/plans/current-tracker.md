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

| ID                                   | Status        | Owner                   | Work                                                                                     | Exit Criteria                                                                                                                                                                      |
| ------------------------------------ | ------------- | ----------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `S5-SAVED-DRAFT-ACCESS-CONTINUATION` | `in_progress` | Codex integration owner | Continue the exact saved draft to review through the existing permitted-access decision. | EN/SQ/MK/SR; clean-complete-preview-only link; exact authenticated resume; loading/error/retry; membership refusal and zero unintended side effects; protected current-head proof. |

### Current acceptance

- Base: freshly fetched protected main `9a51d469481a5843b415a5451ad246e51d54048b`.
- Scope: public secure-save continuation, existing member intake receiver, localized copy, focused
  and native-OTP browser proof, exact corpus parity and canonical authority reconciliation.
- Expired-session recovery preserves the opaque selection at sign-in, reuses the existing neutral
  email-code flow and rechecks ownership before returning; password sign-in retains role-filtered targets.
- SRS: `IDA-FST-008/010/011/012`; automated bounded acceptance does not close business acceptance.
- Preserve: existing proxy/query/auth/tenant/owner checks, membership eligibility, review-before-submit,
  save/return/delete, active-member submission/reopen and retry protections.
- Dependency: fresh-account first submission remains conditional on S6 provider-backed activation
  (`IDA-MEM-006`); no grant, purchase, payment or business semantics are invented.
- Forbidden: proxy, auth-mechanism, tenant, schema, billing or architectural changes; incident facts in URLs;
  claim creation on continuation; injury/document persistence; production deployment.

## Product Queue

Product implementation continues with one bounded S5 saved-draft access-continuation increment.
Completed bounded outcomes remain credited; queued does not mean in progress or verified.

| Outcome                                     | Status                | Direct next evidence                                                                                                                                                   |
| ------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S5 — member first-case journey              | `active_bounded`      | Deliver exact saved-draft continuation; credit #1801/#1803/#1814/#1817 and closed #1816/#1821 diagnostics/recovery; fresh-account activation and whole S5 remain open. |
| S6 — member continuation/membership         | `delivered_bounded`   | Credit protected #1815 for lifecycle/current-period/access disclosure; whole S6, offer, activation and renewal remain open.                                            |
| S7 — staff handling                         | `delivered_bounded`   | Credit assigned-staff acknowledgement in protected #1814; fulfilment and whole S7 remain open.                                                                         |
| S8/S9 — agent handoff and activation        | `queued_conditional`  | Established assignment, attribution, member ownership and Paddle contracts.                                                                                            |
| S10–S12 — branch/tenant/platform operations | `queued_conditional`  | Existing role/scope contracts; no custom-role or impersonation expansion.                                                                                              |
| H1 — SVC-CORE / Help Now                    | `priority_when_ready` | First unmet service clause plus accepted country/content/stop-rule authority.                                                                                          |
| S13/S14 — closure and pilot rehearsal       | `queued_conditional`  | Applicable recovery/business/operations evidence, then complete role/accessibility/locale rehearsal.                                                                   |

The [requirement disposition map](requirement-disposition-map.md) remains the complete 510-clause
SRS/frontier index. Its unresolved rows are not automatic features, deferrals or blanket blockers.

## Proof Ledger

| ID                                   | Source Refs                                                    | Execution  | Run ID  | Run Root                               | Sonar   | Docker         | Sentry         | Learning | Evidence Refs                                                                                                                                                                                                              |
| ------------------------------------ | -------------------------------------------------------------- | ---------- | ------- | -------------------------------------- | ------- | -------------- | -------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `S5-SAVED-DRAFT-ACCESS-CONTINUATION` | owner authorization; SRS `IDA-FST-008/010/011/012`; main #1821 | `scripted` | pending | focused proof; protected final pending | pending | not_applicable | not_applicable | pending  | apps/web/src/components/claims/claim-draft-intake/draft-continuation.test.tsx; apps/web/src/components/claims/claim-draft-intake/use-draft-continuation.test.tsx; apps/web/e2e/gate/s5-new-account-otp-secure-save.spec.ts |

## Current Facts

- `IDA-FST-004` disclosure is staging-delivered through #1817 (`a5dd1e455628b7c9826c80683237adcbd0d2d4f3`)
  on exact main `9a51d469481a5843b415a5451ad246e51d54048b` after separate #1821 RLS timeout recovery.
  Automatic CD #36088924719 passed P0.1/P0.2/P0.3/P0.4/P0.6 and skipped production. Canonical health
  proved the SHA; release-report deployment metadata remained `unknown` after a probe failure.
  [Prior S5 handoff](https://github.com/interdomestik/interdomestik/pull/1817#issuecomment-5826423914)
  preserves exact receipts and completed resource retirement. Alias diagnostics are not reopened.
- #1801 proves active-member saved-draft submit/reopen; #1803 proves native-origin newly verified
  account save/return/delete and isolation. Neither proves fresh-account activation/submission.
- #1814 request-linked upload and assigned-staff acknowledgement and #1815 membership disclosure
  remain delivered within scope. Request fulfilment and whole S6/S7 remain open.
- Current implementation routes only an opaque draft UUID through the fragment of the already
  permitted manager route. It does not relax membership or create any server-side entity.
- Initial disk headroom was 5.5 GiB; installing locked dependencies left 3.6 GiB. Heavy local build
  capacity is insufficient given the prior ENOSPC receipt. Use protected current-head hosted proof
  for the expensive lane; retain focused local proof and document any environment limitation.
- No deployment, product readiness or user-acceptance claim is made for this candidate before
  protected delivery; prior scoped staging receipts above retain their original meaning.

## Next Selection

Complete the bounded continuation through protected checks and exact-main automatic staging.
Then select the smallest remaining S5 outcome under current-program order. Fresh-account first-case
submission needs an accepted S6 provider/activation contract; never substitute a synthetic membership.
Broader category/locale process evidence, business review and whole-pilot acceptance remain open.
Canonical final merge/staging facts may be reconciled in the next ordinary authorized product PR;
no status-only PR is required.

## Historical Evidence

- [Prior active queue and proof ledger](history/2026-09-22-current-tracker-ledger.md)
- [Prior program and delivered-scope ledger](history/2026-09-22-current-program-ledger.md)
- [Implementation conformance log](2026-03-03-implementation-conformance-log.md)
- [Pre-Rev-243 authority manifest](history/current-authority/2026-08-16-through-rev-243.manifest.json)

Historical allocations, projections and receipts retain their original meaning but do not select or
block ordinary work. Explicit legacy validation remains available for changes to those artifacts or
their consumers.
