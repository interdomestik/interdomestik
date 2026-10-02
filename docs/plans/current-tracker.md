---
plan_role: tracker
status: active
source_of_truth: true
owner: platform
last_reviewed: 2026-10-02
current_program_path: docs/plans/current-program.md
execution_log_path: docs/plans/2026-03-03-implementation-conformance-log.md
status_command: pnpm plan:status
---

# Current Tracker

> This is the single active tracker. Historical proof is linked, not repeated.

## Active Queue

`S7-MEMBER-MESSAGE-READ-CONTINUITY` is technically delivered by [#1858](https://github.com/interdomestik/interdomestik/pull/1858).
Exact-merge staging/P0 passed. The remaining acceptance row is `blocked` only on
human staff/member validation; technical delivery is complete. Live acceptance remains open;
completed proof is in the [historical ledger](history/2026-09-22-current-tracker-ledger.md#s7-message-read-continuity-1858).
No deployment, product readiness or user-acceptance claim extends beyond that bounded technical evidence.

| ID                                  | Status        | Owner                   | Work                                                                                                    | Exit Criteria                                                                                                                                       |
| ----------------------------------- | ------------- | ----------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `S7-MEMBER-MESSAGE-READ-CONTINUITY` | `blocked`     | Codex integration owner | Validate the delivered message repair in the live cross-role journey.                                   | Real RLS regression, public/private and denied-access tests, independent review, required local/protected proof and live cross-role retest.         |
| `S7-MEMBER-NEXT-ACTION-TRUTH`       | `in_progress` | Codex integration owner | Show neutral verification detail/update navigation without claiming a pending request; Opus implements. | Actual projection/rendered locale regressions, unchanged query/privacy and draft contracts, current-head review and required local/protected proof. |

### Confirmed acceptance slice

Staff-history projection performance is technically delivered by
[#1859](https://github.com/interdomestik/interdomestik/pull/1859); completed proof is in the
[historical ledger](history/2026-09-22-current-tracker-ledger.md#s7-staff-history-projection-delivery-1859).
Staff detail continuity is delivered by [#1860](https://github.com/interdomestik/interdomestik/pull/1860);
its [historical ledger](history/2026-09-22-current-tracker-ledger.md#s7-staff-detail-read-continuity-delivery-1860) records staging and partial agent journey proof.
Member amount continuity is technically delivered by [#1861](https://github.com/interdomestik/interdomestik/pull/1861);
exact-merge staging and the agent real EUR retake passed. Completed proof is in the [historical ledger](history/2026-09-22-current-tracker-ledger.md#s7-member-case-amount-continuity-delivery-1861).

`S7-MEMBER-MESSAGE-READ-CONTINUITY` — technical delivery complete; live acceptance pending, Codex integration owner.
Exit: protected repair delivery and exact-merge staging, approved synthetic identities/case, real browser login and
member/staff/admin observations bound to the delivered SHA; technical proof and Arben acceptance separate.

### Current acceptance

- #1861 amount/currency continuity is technically delivered; see the [historical ledger](history/2026-09-22-current-tracker-ledger.md#s7-member-case-amount-continuity-delivery-1861).
- Current bounded repair: verification overview offers neutral detail/update navigation; lifecycle status does not establish an outstanding request.
- Preserve all other generic lifecycle states and request-specific progress; no new queries or writers.
- Human acceptance and broader S7 remain open; completed baseline/helper facts are in the [historical ledger](history/2026-09-22-current-tracker-ledger.md#s7-member-next-action-truth-candidate).
- #1860 staff-detail technical delivery and partial agent public/internal journey passed; see the [historical ledger](history/2026-09-22-current-tracker-ledger.md#s7-staff-detail-read-continuity-delivery-1860). Human acceptance and staff public notifications remain open.

- Protected merge `9f9d78b0081e080ac081d7dafc0918af1fa41599` and exact-merge staging/P0 passed.
  Detailed local, hosted, review and retry evidence is in the linked historical ledger.
  Human staff/member acceptance remains pending.
- Owned public messages load, retry and reload; sender projection and empty state remain usable.
- Internal notes stay inaccessible to members and agents; cross-member/tenant and operational scope denials hold.
- Read receipts mutate only authorized visible messages; include dependent fixes only when reproduction proves necessity.
- SRS v0.9 IDA-COM-005 and IDA-CAS-006/008 guide this bounded repair alongside shipped M0–M5; no whole-clause completion claim.
- Preserve tenant ownership, privacy, auth layering, proxy, canonical routes and page-ready contracts.
- Execute the [member/staff/admin scenario](../guides/staging-staff-member-admin-acceptance.md)
  on the delivered staging SHA and record search latency samples separately from correctness.
- Record elapsed start-to-staging, full verification attempts/reasons, actual Claude coding/model,
  integrator corrections and defects found after final review in the existing receipt.
- Prior #1854 save recovery and #1856 case-read/logout evidence remain delivered; message repair is technically delivered; human acceptance remains pending.
- Staff-history projection performance is delivered by #1859. Its local synthetic evidence
  does not establish staging or whole-journey latency; #1858 remains a correctness repair.

## Product Queue

| Outcome                                     | Status                | Direct next evidence                                                                                                                                           |
| ------------------------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S5 — member first-case journey              | `delivered_bounded`   | Credit #1841 shared evidence next action, #1840 Free Start boundary, #1836 retrieval and earlier work; remaining S5 and approved offer comparison remain open. |
| S6 — member continuation/membership         | `delivered_bounded`   | Credit #1838 period/grace truth, #1837 payment-method recovery and #1815/#1824–#1836; approved offer/terms, live paid activation and renewal remain open.      |
| S7 — staff handling                         | `active_bounded`      | Credit #1861 amount continuity, #1860 staff detail and earlier bounded repairs; next-action alignment is active; human acceptance and whole S7 remain open.    |
| S8/S9 — agent handoff and activation        | `queued_conditional`  | Established assignment, attribution, ownership and Paddle contracts.                                                                                           |
| S10–S12 — branch/tenant/platform operations | `queued_conditional`  | Existing role/scope contracts; no custom-role or impersonation expansion.                                                                                      |
| H1 — SVC-CORE / Help Now                    | `priority_when_ready` | First unmet service clause and accepted country/content/stop-rule authority.                                                                                   |
| S13/S14 — closure and pilot rehearsal       | `queued_conditional`  | Applicable recovery/business/operations evidence and complete role/accessibility/locale rehearsal.                                                             |

The [requirement disposition map](requirement-disposition-map.md) preserves the full 510-clause
frontier. Unresolved rows are neither automatic features nor blanket blockers.

## Proof Ledger

| ID                                  | Source Refs                                            | Execution  | Run ID      | Run Root                                                         | Sonar   | Docker  | Sentry         | Learning | Evidence Refs                                                                                                                                         |
| ----------------------------------- | ------------------------------------------------------ | ---------- | ----------- | ---------------------------------------------------------------- | ------- | ------- | -------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `S7-MEMBER-MESSAGE-READ-CONTINUITY` | IDA-COM-005; IDA-CAS-006/008; merge `9f9d78b008`       | `scripted` | 36896119780 | exact-merge staging/P0 passed; live acceptance pending           | pass    | pass    | not_applicable | pass     | [test scenario](../guides/staging-staff-member-admin-acceptance.md); prior delivery [#1856](https://github.com/interdomestik/interdomestik/pull/1856) |
| `S7-MEMBER-NEXT-ACTION-TRUTH`       | IDA-NFR-008; IDA-CAS-007; IDA-COM-005; base `42ca3927` | `pending`  | pending     | bounded generic verification actor alignment; full proof pending | pending | pending | not_applicable | pending  | [candidate evidence](history/2026-09-22-current-tracker-ledger.md#s7-member-next-action-truth-candidate)                                              |

## Current Facts

Completed #1856/#1857 delivery proof is preserved in the
[historical ledger](history/2026-09-22-current-tracker-ledger.md#s7-message-repair-predecessors-1856-1857).
The message repair, staff-history performance and staff-detail repair are technically delivered.
The partial agent journey verified public/internal visibility; human acceptance and staff public
notification remain open. #1861 amount continuity is technically delivered; the next-action
consistency repair is confirmed with Opus implementation under the existing accepted contract.

Credit [#1854](https://github.com/interdomestik/interdomestik/pull/1854) for delivered staff status/note save recovery.
Its [historical receipt](history/2026-09-22-current-tracker-ledger.md#s7-staff-status-save-recovery-1854)
contains merge, staging and resource-retirement proof. Whole S7 and human acceptance remain open.

Credit [#1847](https://github.com/interdomestik/interdomestik/pull/1847) decline preview,
[#1849](https://github.com/interdomestik/interdomestik/pull/1849) staging recovery,
[#1850](https://github.com/interdomestik/interdomestik/pull/1850) admin-list tenant/RLS,
[#1851](https://github.com/interdomestik/interdomestik/pull/1851) grantable-role protection and
[#1853](https://github.com/interdomestik/interdomestik/pull/1853) records search/filter recovery.
Main `b0dfc1858b962f0920e628d1f011fcdc63535bcd` passed exact-main
[CD 36744876702](https://github.com/interdomestik/interdomestik/actions/runs/36744876702) staging/P0;
production was skipped. Do not repeat completed proof or claim staff/member user acceptance.

- #1845 protected-merged as `28a4f27ff03b4eb57bc098b06df5137bfe292491`. Automatic exact-main
  [CD `36528840781`](https://github.com/interdomestik/interdomestik/actions/runs/36528840781)
  passed staging deployment, health, provenance and configured P0; production was skipped.
  Migration `0096` was subsequently applied and read-only verified on staging Supabase project
  `xjyseqtfuxcuviiankhy` only (97 ledger rows, exact hash, three columns and constraints); the
  production project was untouched. At that delivery, live S7 interaction was unverified because the staging
  route required approved staff/member credentials. The current acceptance slice now has those credentials. Credit the
  bounded request fulfilment without claiming whole `IDA-CLM-010`, S7 or user acceptance.
- #1842 protected-merged as `670f8db1d5323cd5fb9196b7c29b2b3fbc17ac52`. Automatic
  exact-main [CD `36510619671`](https://github.com/interdomestik/interdomestik/actions/runs/36510619671)
  passed staging build, provenance, health and P0 gates on that SHA; production was skipped.
  Credit assigned-staff grouping and saved-date operational follow-up without claiming request
  fulfilment, escalation, whole S7 or user acceptance.
- #1841 protected-merged as `333404dc38f66e7371e8fa362c56b6d709d22580`. Its
  [receipt](https://github.com/interdomestik/interdomestik/pull/1841#issuecomment-5880047468)
  records passing final-head local/protected checks and automatic exact-main
  [CD `36491921295`](https://github.com/interdomestik/interdomestik/actions/runs/36491921295)
  with staging P0 passed and production skipped. Credit shared open request/next-action truth;
  fulfilment, whole S5/S7 and user acceptance remain open.
- #1840 protected-merged as `a51fcc86371794fc5ec3eabb62b36efbf457edb5`. Automatic
  exact-main [CD `36482936539`](https://github.com/interdomestik/interdomestik/actions/runs/36482936539)
  passed on that SHA with production skipped. Credit its bounded four-locale Free Start service
  boundary; product/privacy content review, whole S5 and user acceptance remain open.
- #1838 protected-merged as `667d268afdaa36801dcd1c5217d931820a0e5182`; its final-head
  `pr:verify` and `security:guard` passed. Automatic exact-main [CD `36448107695`](https://github.com/interdomestik/interdomestik/actions/runs/36448107695)
  passed on that SHA with
  production skipped. Credit its bounded period/grace truth without repeating proof or claiming
  renewal, live paid activation, whole S6 or user acceptance.
- #1839 historical Secret Scan triage protected-merged as exact main
  `a0928a1a276405d597e253de887c5b2fe9a77a1e`. Automatic [CD `36459687724`](https://github.com/interdomestik/interdomestik/actions/runs/36459687724)
  passed staging build, provenance, health and configured P0 gates; production was skipped. Three
  historical Sonar tokens remain unsuppressed pending revocation evidence; this is not incident closure.
- #1837 protected-merged as `5a6c91681149edf74b0ee0e3d6337797fdb34c28`; its ordinary PR
  records passing local/protected checks and independent review. Automatic exact-main staging CD
  `36424375788` completed successfully on that SHA; production was skipped. Credit its bounded
  owner-scoped Paddle recovery action without repeating it or claiming live recovery, renewal or
  whole S6.
- #1836 protected-merged as `feec2f490ff440035de875e97021cd9045abf68c`; its ordinary PR
  receipt records final protected CI/E2E/Pilot passes and automatic exact-main staging CD
  `36403528530` attempt 2 with attested build, health/provenance and configured P0 roles passing.
  Production was skipped. Credit its bounded own-document retrieval without rerunning it or
  claiming whole S5/S6.
- #1835 protected-merged as `392bf2e3527a8cb55242e34ef84223c5e726826c`; its updated receipt records
  passing local/protected evidence and automatic exact-main staging CD `36329153101` attempt 3 with
  staging build, health, provenance and P0.1/P0.2/P0.3/P0.4/P0.6 passing. Production was skipped;
  its owned branch/worktree were retired. Credit its bounded member communication proof without
  rerunning it or claiming whole S5/S6.
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
- #1854 is technically verified, merged and staged; human acceptance remains open.
  #1855 has separate exact-merge staging proof on `6405f13a5`; human acceptance remains open. No production changes.

## Next Selection

Arben confirmed `S7-MEMBER-NEXT-ACTION-TRUTH` and sending the prepared packet to Claude Pro
with Opus implementing. Review corrected the initial companion-parity assumption: the bounded
verification guidance must be neutral and must not claim outstanding requested data. Preserve
draft guidance; no new request-aware read, precedence or writer is selected.
#1861 closeout is carried in this product amendment; publication awaits its merge/readback.

Arben confirmed `S7-LIVE-STAFF-MEMBER-ACCEPTANCE` in the owner chat on 2026-09-30.
Live acceptance started on 2026-10-01. The owner authorized repair and retesting of missing member case reads and mobile account access. No completion or live acceptance is claimed. PR [#1855](https://github.com/interdomestik/interdomestik/pull/1855) merged as
`6405f13a5ca545e646189d0b15c298bb8d589824`; exact-merge
[staging CD 36780409189](https://github.com/interdomestik/interdomestik/actions/runs/36780409189) passed.
Now exercise real browser login and the delivered
staff/member journey using approved staging identities and test cases. Record actual outcomes,
privacy boundaries and any reproducible gap; do not infer human acceptance from API-login P0.
No new conflict policy, legal/SLA semantics, billing or architecture change is selected.

Approved offer/entity/versioned terms, live paid activation, broader renewal/dunning,
MK secret/provider permissions and whole S5/S6/cross-role/user acceptance remain open.
Final merge/staging facts may be reconciled in the next ordinary authorized product amendment.

## Historical Evidence

- [Prior active queue and proof ledger](history/2026-09-22-current-tracker-ledger.md)
- [Prior program and delivered-scope ledger](history/2026-09-22-current-program-ledger.md)
- [Implementation conformance log](2026-03-03-implementation-conformance-log.md)
- [Pre-Rev-243 authority manifest](history/current-authority/2026-08-16-through-rev-243.manifest.json)

Historical allocations, projections and receipts retain their original meaning but do not select or
block ordinary work. Explicit legacy validation remains available for changes to those artifacts or
their consumers.

Historical proof context: #1856 had zero open Sonar findings at its final PR head. Its worktree is archived; the local DB remains in use by the message-repair successor. Label-trigger duplication and the unresolved live message-read gap remain recorded findings. #1857 passed protected checks and exact-merge staging as `3a9f2b1cb`; its worktree is archived. Observation of future label-event behavior remains pending.
