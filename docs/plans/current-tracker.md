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

| ID                             | Status        | Owner                   | Work                                                                                                | Exit Criteria                                                                                                                            |
| ------------------------------ | ------------- | ----------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `S6-PROVIDER-ACTIVATION-RETRY` | `in_progress` | Codex integration owner | Recover a verified Paddle activation after its processed transaction evidence arrives out of order. | Typed pre-write deferral; exact compare-and-set reclaim; replay/isolation regressions; protected proof and exact-main automatic staging. |

### Current acceptance

- Base is protected main `369bbd0987fab894958f125492aa3df909ecb196`; #1823 closed the prior
  staging-readiness repair and automatic staging completed #1822 acceptance.
- Only absent same-scope processed transaction evidence or a documented transient Paddle customer
  lookup failure may produce the typed retryable pre-write result. Subscription/transaction customer
  IDs must match and the same entity's Paddle client must return that active customer. Conflict,
  permanent provider errors and post-mutation failures remain permanent.
- Reclaim requires the exact dedupe key, processing scope, payload hash, valid signature and
  `retryable_error` state. The database compare-and-set admits one parallel claimant.
- Existing provider status mapping and active/trialing lifecycle access remain unchanged. Browser
  success state grants nothing; whole offer/terms/snapshot/renewal acceptance remains open.
- No proxy/auth mechanism, tenancy policy, schema, pricing, production or guard bypass is authorized.

## Product Queue

The delivered staging repair and S5 continuation remain credited. This bounded S6 dependency is
selected because fresh-account S5 submission cannot substitute a synthetic membership.
Completed bounded outcomes remain credited; queued does not mean in progress or verified.

| Outcome                                     | Status                | Direct next evidence                                                                                                                    |
| ------------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| S5 — member first-case journey              | `active_bounded`      | Credit #1801/#1803/#1814/#1817/#1822 and #1823 staging recovery; fresh-account provider activation and whole S5 remain open.            |
| S6 — member continuation/membership         | `active_bounded`      | Deliver provider activation retry; credit #1815 disclosure; whole S6, entity/terms snapshot, offer, activation and renewal remain open. |
| S7 — staff handling                         | `delivered_bounded`   | Credit assigned-staff acknowledgement in protected #1814; fulfilment and whole S7 remain open.                                          |
| S8/S9 — agent handoff and activation        | `queued_conditional`  | Established assignment, attribution, member ownership and Paddle contracts.                                                             |
| S10–S12 — branch/tenant/platform operations | `queued_conditional`  | Existing role/scope contracts; no custom-role or impersonation expansion.                                                               |
| H1 — SVC-CORE / Help Now                    | `priority_when_ready` | First unmet service clause plus accepted country/content/stop-rule authority.                                                           |
| S13/S14 — closure and pilot rehearsal       | `queued_conditional`  | Applicable recovery/business/operations evidence, then complete role/accessibility/locale rehearsal.                                    |

The [requirement disposition map](requirement-disposition-map.md) remains the complete 510-clause
SRS/frontier index. Its unresolved rows are not automatic features, deferrals or blanket blockers.

## Proof Ledger

| ID                             | Source Refs                                                            | Execution  | Run ID  | Run Root                                     | Sonar   | Docker         | Sentry         | Learning | Evidence Refs                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------ | ---------------------------------------------------------------------- | ---------- | ------- | -------------------------------------------- | ------- | -------------- | -------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `S6-PROVIDER-ACTIVATION-RETRY` | owner selection; IDA-MEM-006/007; main `369bbd0`; Paddle ordering docs | `scripted` | pending | focused failure/replay/isolation regressions | pending | not_applicable | not_applicable | pending  | packages/domain-membership-billing/src/paddle-webhooks/persist.test.ts; packages/domain-membership-billing/src/paddle-webhooks/handlers/subscriptions-retry.test.ts; packages/domain-membership-billing/src/paddle-webhooks/handlers/utils/checkout-transaction-evidence.test.ts; apps/web/src/app/api/webhooks/paddle/_core.retry.test.ts; apps/web/src/app/api/webhooks/paddle/paddle-customer.test.ts; apps/web/e2e/gate/billing-webhook-retry-cas.spec.ts |

## Current Facts

- #1823 merged exact main `369bbd0987fab894958f125492aa3df909ecb196`; protected checks and
  automatic staging CD #36111178342 passed immutable/canonical health and P0.1/P0.2/P0.3/P0.4/P0.6.
  Production stayed unchanged. The prior #1822 continuation is staging-delivered and both repairs
  retain their original bounded claims.
- Current source can defer an anonymous `subscription.created` before its related transaction event,
  but dedupe then treats the provider retry as final and prevents recovery. The selected candidate
  separates this pre-write condition from permanent failures and reclaims only exact verified retry.

- `IDA-FST-004` disclosure is staging-delivered through #1817 (`a5dd1e455628b7c9826c80683237adcbd0d2d4f3`)
  on exact main `9a51d469481a5843b415a5451ad246e51d54048b` after separate #1821 RLS timeout recovery.
  Automatic CD #36088924719 passed P0.1/P0.2/P0.3/P0.4/P0.6 and skipped production. Canonical health
  proved the SHA; release-report deployment metadata remained `unknown` after a probe failure.
  [Prior S5 handoff](https://github.com/interdomestik/interdomestik/pull/1817#issuecomment-5826423914)
  preserves exact receipts and completed resource retirement. The current repair addresses a newly
  reproduced health integration omission and deployment recovery deadlock; prior credit is unchanged.
- #1801 proves active-member saved-draft submit/reopen; #1803 proves native-origin newly verified
  account save/return/delete and isolation. Neither proves fresh-account activation/submission.
- #1814 request-linked upload and assigned-staff acknowledgement and #1815 membership disclosure
  remain delivered within scope. Request fulfilment and whole S6/S7 remain open.
- Current implementation routes only an opaque draft UUID through the fragment of the already
  permitted manager route. It does not relax membership or create any server-side entity.
- Current preflight found 5.3 GiB before offline locked install and 4.3 GiB afterwards. Prior ENOSPC
  evidence still limits confidence in a local heavy lane; retain focused proof and use protected
  current-head checks for hosted trust evidence without transferring old-head results.
- A focused Playwright attempt reached the command-owned web-server auto-build but could not start:
  webpack cache write returned `ENOSPC`, followed by a missing standalone stamp. Current-head E2E
  execution remains pending hosted proof; no browser/database pass is claimed from that attempt.
- No provider configuration, production deployment, whole activation, product readiness or user-
  acceptance claim is made. The unresolved MK Paddle webhook secret and unverified `customer.read`
  permission on deployed entity API tokens remain external operations dependencies.

## Next Selection

Complete this bounded S6 retry recovery through protected checks and exact-main automatic staging.
Then hand off the remaining S5/S6 gaps without starting another slice. Fresh-account first-case
submission still needs accepted provider activation; never substitute a synthetic membership.
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
