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

| ID                           | Status        | Owner                   | Work                                                                                     | Exit Criteria                                                                                                                                |
| ---------------------------- | ------------- | ----------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `STAGING-READINESS-RECOVERY` | `in_progress` | Codex integration owner | Repair health-only RLS recovery and safe staging replacement of an unhealthy old target. | Fail-closed regressions; immutable identity/health separation; strict replacement/rollback gates; protected proof and exact-main staging P0. |

### Current acceptance

- Owner requested a durable correction after repeated failures; base protected main `e0cbdf1548fc5968f6714dbf68d630eb44dd4722`.
- Health must await existing RLS readiness before touching the guarded client. Preserve single flight,
  cooldown, pending-query bounds, unsafe-role refusal and existing retry classification.
- Snapshot the previous owned deployment through validated static staging metadata; record health
  separately and reject identity disagreement. Never treat metadata as healthy-runtime proof.
- Verify exact replacement health before alias movement, then provider mapping and canonical health.
  Rollback still requires fresh old-target health; unavailable recovery reports failure without mutation.
- No proxy/auth mechanism, tenancy policy, schema, billing, production or guard bypass is authorized.
- #1822 saved-draft continuation is protected-merged with exact-source proof; canonical staging remains
  pending. Fresh-account submission still depends on S6 provider-backed activation `IDA-MEM-006`.

## Product Queue

The bounded staging repair completes delivery of the merged S5 continuation before successor selection.
Completed bounded outcomes remain credited; queued does not mean in progress or verified.

| Outcome                                     | Status                | Direct next evidence                                                                                                                                               |
| ------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| S5 — member first-case journey              | `active_bounded`      | Finish staging for protected #1822; credit #1801/#1803/#1814/#1817 and closed #1816/#1821 diagnostics/recovery; fresh-account activation and whole S5 remain open. |
| S6 — member continuation/membership         | `delivered_bounded`   | Credit protected #1815 for lifecycle/current-period/access disclosure; whole S6, offer, activation and renewal remain open.                                        |
| S7 — staff handling                         | `delivered_bounded`   | Credit assigned-staff acknowledgement in protected #1814; fulfilment and whole S7 remain open.                                                                     |
| S8/S9 — agent handoff and activation        | `queued_conditional`  | Established assignment, attribution, member ownership and Paddle contracts.                                                                                        |
| S10–S12 — branch/tenant/platform operations | `queued_conditional`  | Existing role/scope contracts; no custom-role or impersonation expansion.                                                                                          |
| H1 — SVC-CORE / Help Now                    | `priority_when_ready` | First unmet service clause plus accepted country/content/stop-rule authority.                                                                                      |
| S13/S14 — closure and pilot rehearsal       | `queued_conditional`  | Applicable recovery/business/operations evidence, then complete role/accessibility/locale rehearsal.                                                               |

The [requirement disposition map](requirement-disposition-map.md) remains the complete 510-clause
SRS/frontier index. Its unresolved rows are not automatic features, deferrals or blanket blockers.

## Proof Ledger

| ID                           | Source Refs                                        | Execution  | Run ID  | Run Root                                       | Sonar   | Docker         | Sentry         | Learning | Evidence Refs                                                                                                                                       |
| ---------------------------- | -------------------------------------------------- | ---------- | ------- | ---------------------------------------------- | ------- | -------------- | -------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `STAGING-READINESS-RECOVERY` | owner correction; #1822 CD failure; main `e0cbdf1` | `scripted` | pending | focused regression and live read-only snapshot | pending | not_applicable | not_applicable | pending  | apps/web/src/features/health/health-readiness.test.ts; scripts/ci/staging-candidate-health.test.mjs; scripts/ci/vercel-staging-alias-state.test.mjs |

## Current Facts

- #1822 merged to `e0cbdf1548fc5968f6714dbf68d630eb44dd4722`; reviewed source `91dd5d170e652ff25973a713fdfd43dee0f2b439` has identical tree. All nine required checks and strict readiness passed;
  web unit 3,568 pass/12 existing skips; E2E 272 pass plus one existing retry pass, 17 configured skips,
  13 smoke pass. New actual-OTP continuation journey passed. See the PR for final source/run evidence.
- CD #36103643236 created healthy exact-main immutable preview `interdomestik-p9zu6ducx-ecohub.vercel.app`
  but failed checking old `interdomestik-eyp56brxd-ecohub.vercel.app` before alias movement; rollback
  `not-required`, staging E2E skipped. Old target repeatedly returned RLS-readiness 503, later healthy
  on a bounded probe. No manual alias move or production deployment was performed.
- Source and failure evidence identify the health integration omission: direct guarded-client access
  never triggers existing asynchronous recovery. Both this defect and unhealthy-preimage deadlock
  were reproduced in focused tests before correction. New current-head proof is pending.

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
- Initial disk headroom was 5.5 GiB; installing locked dependencies left 3.6 GiB. Heavy local build
  capacity is insufficient given the prior ENOSPC receipt. Use protected current-head hosted proof
  for the expensive lane; retain focused local proof and document any environment limitation.
- No deployment, product readiness or user-acceptance claim is made for this repair before
  protected exact-main verification; #1822 canonical staging remains pending and prior scoped receipts
  retain their original meaning.

## Next Selection

Complete this bounded recovery through protected checks and exact-main automatic staging, including
the merged #1822 continuation.
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
