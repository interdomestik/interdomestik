---
plan_role: tracker
status: active
source_of_truth: true
owner: platform
last_reviewed: 2026-09-27
current_program_path: docs/plans/current-program.md
execution_log_path: docs/plans/2026-03-03-implementation-conformance-log.md
status_command: pnpm plan:status
---

# Current Tracker

> This is the single active tracker. Historical proof is linked, not repeated.

## Active Queue

| ID                             | Status        | Owner                   | Work                                                                     | Exit Criteria                                                                                                      |
| ------------------------------ | ------------- | ----------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `S6-MEMBER-CASE-COMMUNICATION` | `in_progress` | Codex integration owner | Truthful member case-thread recovery and public read-receipt protection. | Own-case public exchange; negative isolation; localized accessible retry; protected checks and exact-main staging. |

### Current acceptance

- Base: freshly fetched protected main `6d31ea1524be95ba6b70945b73d750dff4658ad9`.
- Credit #1777 case continuity, #1780 agent visibility and #1814 evidence acknowledgement.
- Existing eligible member sees only owned case/status/public messages; no other member/tenant,
  internal or unspecified-visibility content/read receipt. Preserve authorized staff scope.
- Localized loading/error/empty/retry and named keyboard controls across EN/SQ/MK/SR.
- Failed send retains draft; confirmed send survives failed refresh; stale case/user responses
  cannot overwrite new state or draft. No new messaging protocol or operator UI redesign is implied.
- Two disjoint implementation workers: domain read receipts versus member UI/locales. Integrator
  handles contract, integrated browser proof/review. One consolidated heavy lane after corrections.
- Required local/hosted checks, independent current-head review, protected merge and exact-main
  automatic staging; no production, charge or full cross-role/user acceptance claim.

## Product Queue

| Outcome                                     | Status                | Direct next evidence                                                                                                                                       |
| ------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S5 — member first-case journey              | `active_bounded`      | Credit #1801/#1803/#1814/#1817/#1822/#1823/#1825–#1829; member case communication is selected; credit #1830–#1834; approved offer comparison remains open. |
| S6 — member continuation/membership         | `active_bounded`      | Deliver bounded member case communication; credit #1815 and #1824–#1834; approved offer/terms, live paid activation and renewal remain open.               |
| S7 — staff handling                         | `delivered_bounded`   | Credit #1814 assigned-staff acknowledgement; fulfilment and whole S7 remain open.                                                                          |
| S8/S9 — agent handoff and activation        | `queued_conditional`  | Established assignment, attribution, ownership and Paddle contracts.                                                                                       |
| S10–S12 — branch/tenant/platform operations | `queued_conditional`  | Existing role/scope contracts; no custom-role or impersonation expansion.                                                                                  |
| H1 — SVC-CORE / Help Now                    | `priority_when_ready` | First unmet service clause and accepted country/content/stop-rule authority.                                                                               |
| S13/S14 — closure and pilot rehearsal       | `queued_conditional`  | Applicable recovery/business/operations evidence and complete role/accessibility/locale rehearsal.                                                         |

The [requirement disposition map](requirement-disposition-map.md) preserves the full 510-clause
frontier. Unresolved rows are neither automatic features nor blanket blockers.

## Proof Ledger

| ID                             | Source Refs                                                                  | Execution  | Run ID  | Run Root                                     | Sonar   | Docker         | Sentry         | Learning | Evidence Refs                                                                  |
| ------------------------------ | ---------------------------------------------------------------------------- | ---------- | ------- | -------------------------------------------- | ------- | -------------- | -------------- | -------- | ------------------------------------------------------------------------------ |
| `S6-MEMBER-CASE-COMMUNICATION` | owner continuation; IDA-COM-005; protected main `6d31ea1`; #1777/#1780/#1814 | `scripted` | pending | isolated eligible-member communication proof | pending | not_applicable | not_applicable | pending  | public read receipts; thread failure/retry; case isolation; localized controls |

## Current Facts

- #1834 protected-merged as `6d31ea1524be95ba6b70945b73d750dff4658ad9`; automatic exact-main
  staging CD `36323164992` attempt 1 passed build, health, provenance and all configured P0 roles.
  Production was skipped; owned worktree/database retired. Its PR receipt credits local/protected
  proof and two full-proof attempts (one pre-E2E interruption); do not repeat that delivered proof.

PR [#1830](https://github.com/interdomestik/interdomestik/pull/1830) delivered provider-event
ordering as protected merge `069099bc1e4628df8f5b87c91bd96245a959f67e`. #1831–#1833 repaired staging
trust, schema and transport. The [#1833 receipt](https://github.com/interdomestik/interdomestik/pull/1833#issuecomment-5855811154)
credits exact main `3cb81b15a4cd5005efccdd5cd1dfcb1ada9b5864`, protected checks, Sonar and automatic
staging CD `36312718148` attempt 4 with full P0 passing. Production was skipped. This closes the
stale provider-event-order status; its proof is credited, not repeated by this recovery slice.

- #1829 protected-merged at `5e696747a7091e738b174830ec0a474f578af2fd`. Automatic CD `36247906583`
  rolled back safely after a transient network failure, then passed exact-main staging
  P0.1/P0.2/P0.3/P0.4/P0.6 on an unchanged-source retry; production jobs were skipped and no charge
  or provider mutation was made.
- #1829 proves first-activation reconciliation with the same-scope causal `transaction.completed`
  receipt only. It does not order later lifecycle events, compare an approved offer or prove whole
  S5/S6, IDA-CTR-022/IDA-MEM-006/007 or user acceptance.

- #1828 protected-merged at `d8ba217319d92d48940cfbbbcf4621dd92eeb491`. Protected evidence and
  automatic staging CD `36235608949` passed; production jobs were skipped. See the
  [delivery receipt](https://github.com/interdomestik/interdomestik/pull/1828#issuecomment-5845556668).
- #1828 proves synthetic signed-event downstream continuation, exact replay and explicit saved-draft
  submit only. It carries no authoritative transaction/order/amount/currency evidence and cannot
  satisfy the current provider-order integrity boundary or whole IDA-CTR-022/IDA-MEM-006.

- #1827 protected-merged at `c9238bfe8cf31421606579533d40ef521473d5d4`. Final-head local
  `pr:verify` stopped at the 4 GiB preflight; protected checks and hosted exact-head browser evidence
  passed. Automatic staging CD `36224361750` passed deterministic build/attestation, health,
  build/canonical-alias provenance and staging release-gate E2E; production jobs were skipped. See
  the [delivery receipt](https://github.com/interdomestik/interdomestik/pull/1827#issuecomment-5844085799).
- #1827 proves immutable confirmation delivery and retry only. It does not prove entitlement from a
  verified provider event through saved-case submission, offer/terms, live paid activation or whole S6.
- #1826 protected-merged at `d2a37205ca8db13e684228c9288dd7bbcbd667ec`. Required local/protected
  checks passed. Automatic staging CD `36185398763` attempt 1 hit a transient network precheck and
  rolled back; unchanged-source attempt 2 passed exact-main health and P0.1/P0.2/P0.3/P0.4/P0.6.
  Production jobs were skipped. See the
  [final delivery receipt](https://github.com/interdomestik/interdomestik/pull/1826#issuecomment-5839509942).
- #1826 proves only fail-closed localized confirmation from complete active provider/member state.
  It does not prove immutable delivery, safe retry, offer/terms, live activation or whole S6.
- #1825 protected-merged at `d5e657da2ed88ac94db93cf4cc55343718c08e08`; reviewed head `d99e70b`
  and main share tree `e386461526354ef19a7608a40f999462a5238f67`. Required local/protected checks passed.
  Automatic staging CD `36145768095` passed exact-main health and P0.1/P0.2/P0.3/P0.4/P0.6;
  production jobs were skipped. See the
  [bounded delivery receipt](https://github.com/interdomestik/interdomestik/pull/1825#issuecomment-5834108770).
- #1825 proves only the signed-in checkout review. It does not prove terms acceptance, a provider
  confirmation, live activation, whole S6 or user acceptance.
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
  acknowledgement, #1815 membership disclosure, #1817 local disclosure and #1825 review remain credited.
- G06 ratifies historical T-503 continuation. Its referenced MINSAS/MK sources do not establish a
  current approved Paddle pilot offer/version and conflict with current payment/refund behavior.
  Approved versioned offer/entity/terms evidence remains a business dependency for capture.
- Owner reconfirmed Paddle-only. Provider approval for actual paid services, MK webhook secret and
  deployed entity-token `customer.read` permission remain unresolved/unverified external evidence.
- Current candidate is not yet verified, merged, staged or user-accepted.
  No deployment, product readiness or user-acceptance claim follows from preparation. No production changes.

## Next Selection

Complete the bounded member communication increment before selecting the next direct S5/S6 gap
or S7. Approved offer/entity/versioned terms, live paid activation, broader renewal/dunning,
MK secret/provider permissions and whole S5/S6/cross-role/user acceptance remain open.
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
