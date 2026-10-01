---
plan_role: canonical_plan
status: active
source_of_truth: true
owner: platform
last_reviewed: 2026-10-01
tracker_path: docs/plans/current-tracker.md
execution_log_path: docs/plans/2026-03-03-implementation-conformance-log.md
status_command: pnpm plan:status
---

# Current Program

> Authority: This document defines the current phase, priority, sequencing and ordinary delivery
> contract. Detailed completed proof is historical and linked below rather than repeated here.

## Current Phase

Credit [#1854](https://github.com/interdomestik/interdomestik/pull/1854) for delivered staff status/note save recovery.
Its [historical receipt](history/2026-09-22-current-tracker-ledger.md#s7-staff-status-save-recovery-1854)
contains merge, staging and resource-retirement proof. Whole S7 and human acceptance remain open.

PR [#1856](https://github.com/interdomestik/interdomestik/pull/1856) protected-merged as
`e15953b9a32b4292f38ed1a8bc11052a3892cb47`. Exact-main CI and
[staging CD 36845871829](https://github.com/interdomestik/interdomestik/actions/runs/36845871829)
passed; production was skipped. Credit member tenant-context read continuity and mobile account
access. Live browser verification found all five owned cases, working details/reloads for cases 02
and 10, successful logout and protected-navigation redirect. The messages panel still fails on both
details, including retry; full staff/member acceptance and whole S7 remain open.

PR [#1857](https://github.com/interdomestik/interdomestik/pull/1857) protected-merged as
`3a9f2b1cb04384e692a50da3d513db59255aa098` on 2026-10-01. Exact-main CI `36857125364`
and [staging CD 36857125345](https://github.com/interdomestik/interdomestik/actions/runs/36857125345)
passed, including staging P0; production was skipped. Its worktree is archived and evidence retained.
Arben selected this bounded delivery-procedure correction after metadata labels
restarted expensive checks on unchanged #1856 source. `DELIVERY-METADATA-CHECK-REUSE` removes label
triggers from CI/E2E/Pilot/backstops, certifies changed ready source automatically, and refreshes
only the lightweight delivery snapshot on label changes. Preserve immutable helper pins, exact
head/base/tree and provider checks, failed/cancelled-result rejection and independent review.
No branch-protection weakening, unconditional check success or product architecture change.

Carry the SRS v0.9 + M0–M5 requirement check in the developer agent and guide. This engineering
maintenance does not complete an SRS clause. The separately authorized performance PR remains
queued against IDA-NFR-002/003: establish comparable retrieval measurements and address demonstrated
causes, without claiming p95 or an approved latency budget from five browser observations.
Retain the newly observed message-read failure as a correctness prerequisite for the full journey.

Arben confirmed `S7-MEMBER-MESSAGE-READ-CONTINUITY` on 2026-10-01 as the next bounded
repair within live acceptance. Credit #1856 merge `e15953b9a` and successful exact-main
staging CD `36845871829` for member case reads and mobile logout. Message reads still fail
on cases 02/10 after retry. Reproduce and repair the necessary communication operations under
existing tenant/RLS context, preserving public/private visibility and authorized read receipts.
SRS v0.9 IDA-COM-005 and IDA-CAS-006/008 guide acceptance alongside shipped M0–M5 and accepted ADRs.
Whole S7 and human acceptance remain open; performance remains a separate authorized PR.
Earlier PR [#1855](https://github.com/interdomestik/interdomestik/pull/1855) merged as
`6405f13a5ca545e646189d0b15c298bb8d589824`; exact-merge
[staging CD 36780409189](https://github.com/interdomestik/interdomestik/actions/runs/36780409189) passed.
Now exercise real browser login and the delivered
staff/member journey using approved staging identities and test cases. Record actual outcomes,
privacy boundaries and any reproducible gap; do not infer human acceptance from API-login P0.
No new conflict policy, legal/SLA semantics, billing or architecture change is selected.

Credit [#1847](https://github.com/interdomestik/interdomestik/pull/1847) decline preview,
[#1849](https://github.com/interdomestik/interdomestik/pull/1849) staging recovery,
[#1850](https://github.com/interdomestik/interdomestik/pull/1850) admin-list tenant/RLS,
[#1851](https://github.com/interdomestik/interdomestik/pull/1851) grantable-role protection and
[#1853](https://github.com/interdomestik/interdomestik/pull/1853) records search/filter recovery.
Main `b0dfc1858b962f0920e628d1f011fcdc63535bcd` passed exact-main
[CD 36744876702](https://github.com/interdomestik/interdomestik/actions/runs/36744876702) staging/P0;
production was skipped. Do not repeat completed proof or claim staff/member user acceptance.

PR [#1845](https://github.com/interdomestik/interdomestik/pull/1845) delivered exact acknowledged,
linked-upload request fulfilment as protected merge `28a4f27ff03b4eb57bc098b06df5137bfe292491`.
Automatic exact-main [CD `36528840781`](https://github.com/interdomestik/interdomestik/actions/runs/36528840781)
passed staging deployment, health, provenance and configured P0; production was skipped. Migration
`0096` was subsequently applied and read-only verified on staging Supabase project
`xjyseqtfuxcuviiankhy` only: 97 ledger rows, exact migration hash, three columns and constraints.
The production project was untouched. At that delivery, live S7 interaction was unverified because the staging
route required approved staff/member credentials. The current acceptance slice now has those credentials. Credit the
bounded fulfilment without claiming whole `IDA-CLM-010` or user acceptance.

PR [#1842](https://github.com/interdomestik/interdomestik/pull/1842) delivered the preceding
assigned-staff queue and saved-date operational follow-up as protected merge
`670f8db1d5323cd5fb9196b7c29b2b3fbc17ac52`. Automatic exact-main
[CD `36510619671`](https://github.com/interdomestik/interdomestik/actions/runs/36510619671)
passed staging build, provenance, health and configured P0 gates on that SHA; production was
skipped. Credit its grouping and follow-up together with #1841 next action and #1814 upload and
acknowledgement. Request fulfilment, lifecycle/SLA, whole S5/S7 and user acceptance remain open.

PR [#1841](https://github.com/interdomestik/interdomestik/pull/1841) delivered the preceding
shared evidence next-action increment as protected merge `333404dc38f66e7371e8fa362c56b6d709d22580`.
Its [delivery receipt](https://github.com/interdomestik/interdomestik/pull/1841#issuecomment-5880047468)
records passing final-head local and protected checks. Automatic exact-main
[CD `36491921295`](https://github.com/interdomestik/interdomestik/actions/runs/36491921295)
passed staging build, provenance, health and configured P0 gates on that SHA; production was
skipped. Credit its persisted open request and four-locale member/staff next action together with
#1814 upload and acknowledgement. Request fulfilment, lifecycle/SLA, whole S5/S7 and user
acceptance remain open.

PR [#1840](https://github.com/interdomestik/interdomestik/pull/1840) delivered the prior
`S5-FREE-START-SERVICE-BOUNDARY` increment as protected merge
`a51fcc86371794fc5ec3eabb62b36efbf457edb5`. Automatic exact-main staging
[CD `36482936539`](https://github.com/interdomestik/interdomestik/actions/runs/36482936539)
passed on that SHA with production skipped. Credit its four-locale service boundary without
repeating proof or claiming content approval or whole S5.

PR [#1839](https://github.com/interdomestik/interdomestik/pull/1839) protected-merged historical
Secret Scan triage as `a0928a1a276405d597e253de887c5b2fe9a77a1e`; automatic exact-main
staging CD `36459687724` passed with production skipped. Three historical Sonar tokens remain
unsuppressed pending revocation evidence; the merge did not close that incident.

PR [#1838](https://github.com/interdomestik/interdomestik/pull/1838) delivered the previous
`S6-MEMBER-PERIOD-GRACE-TRUTH` increment as protected merge
`667d268afdaa36801dcd1c5217d931820a0e5182`. Its final-head local `pr:verify` and
`security:guard` passed; automatic exact-main staging [CD `36448107695`](https://github.com/interdomestik/interdomestik/actions/runs/36448107695)
passed on that SHA with production skipped.
Credit its factual selected-subscription period/grace display and #1837 action continuity without
repeating proof or claiming renewal, live provider acceptance or whole S6.

PR [#1837](https://github.com/interdomestik/interdomestik/pull/1837) delivered owner-scoped
Paddle payment-method recovery as protected merge `5a6c91681149edf74b0ee0e3d6337797fdb34c28`.
Its ordinary PR receipt records local/protected verification and independent review. Automatic
exact-main staging [CD `36424375788`](https://github.com/interdomestik/interdomestik/actions/runs/36424375788)
completed successfully on that merge SHA; production was skipped. Credit its approved per-entity
transaction link, member/tenant/role denial, localized retry and no-entitlement redirect without
repeating the action or treating staging as live provider acceptance.

PR [#1836](https://github.com/interdomestik/interdomestik/pull/1836) delivered owned private-document
retrieval as protected merge `feec2f490ff440035de875e97021cd9045abf68c`. Its ordinary PR receipt
records passing final protected CI/E2E/Pilot checks and automatic exact-main staging CD
[`36403528530`](https://github.com/interdomestik/interdomestik/actions/runs/36403528530), attempt 2:
attested build, staging health/provenance and P0.1/P0.2/P0.3/P0.4/P0.6 passed. Production was
skipped. Credit the bounded five-minute signer, member/tenant/role denial, fresh retry and localized
control without rerunning it or claiming whole S5/S6.

PR [#1835](https://github.com/interdomestik/interdomestik/pull/1835) delivered member case
communication as protected merge `392bf2e3527a8cb55242e34ef84223c5e726826c`. Its updated ordinary
PR receipt records passing local/protected evidence and automatic exact-main staging CD
`36329153101`, attempt 3: staging build, health, provenance and P0.1/P0.2/P0.3/P0.4/P0.6 passed;
production was skipped. Its owned branch/worktree are retired. Credit its public-thread/read-receipt,
loading/retry and send-continuity proof without rerunning it or claiming whole S5/S6.

PR [#1834](https://github.com/interdomestik/interdomestik/pull/1834) delivered ordered past-due
recovery as protected merge `6d31ea1524be95ba6b70945b73d750dff4658ad9`. Its ordinary PR receipt
records passing local/protected evidence and automatic exact-main staging CD `36323164992`,
attempt 1: build, health, provenance and configured P0 roles passed; production was skipped.
Its owned worktree/database are retired. Reuse this proof without rerunning the recovery slice.

PR [#1830](https://github.com/interdomestik/interdomestik/pull/1830) delivered provider-event
ordering as protected merge `069099bc1e4628df8f5b87c91bd96245a959f67e`. #1831–#1833 repaired staging
trust, schema and transport. The [#1833 receipt](https://github.com/interdomestik/interdomestik/pull/1833#issuecomment-5855811154)
credits exact main `3cb81b15a4cd5005efccdd5cd1dfcb1ada9b5864`, protected checks, Sonar and automatic
staging CD `36312718148` attempt 4 with full P0 passing. Production was skipped. This closes the
stale provider-event-order status; its proof is credited, not repeated by this recovery slice.

PR [#1829](https://github.com/interdomestik/interdomestik/pull/1829) delivered first-activation
provider-order integrity as protected merge `5e696747a7091e738b174830ec0a474f578af2fd`. Automatic CD
`36247906583` rolled back safely after a transient network failure, then passed exact-main staging
P0.1/P0.2/P0.3/P0.4/P0.6 on an unchanged-source retry; production jobs were skipped and no charge or
provider mutation was made. Credit its same-scope causal `transaction.completed` reconciliation,
exact identity/customer/currency/item/total match, retryable missing evidence and out-of-order
invoice safety. It does not compare an approved effective-dated offer or prove whole S5/S6,
IDA-CTR-022/IDA-MEM-006/007, live activation or user acceptance.

PR [#1828](https://github.com/interdomestik/interdomestik/pull/1828) delivered the credited synthetic
downstream continuation as protected merge `d8ba217319d92d48940cfbbbcf4621dd92eeb491`. Its
[receipt](https://github.com/interdomestik/interdomestik/pull/1828#issuecomment-5845556668) records
passing protected evidence and automatic staging CD `36235608949`; production jobs were skipped.
Credit its pre-event denial, signed downstream activation, replay and explicit saved-draft submit
proof. Its synthetic `subscription.updated` carried no transaction, order, amount or currency, so it
does not satisfy the #1829 provider-order boundary or whole IDA-CTR-022/IDA-MEM-006.

PR [#1827](https://github.com/interdomestik/interdomestik/pull/1827) delivered immutable membership
confirmation storage and safe retry as protected merge
`c9238bfe8cf31421606579533d40ef521473d5d4`. Its
[receipt](https://github.com/interdomestik/interdomestik/pull/1827#issuecomment-5844085799) records that
final-head local `pr:verify` stopped at the 4 GiB preflight, while protected checks and hosted
exact-head browser evidence passed. Exact-main automatic CD `36224361750` then passed deterministic
build/attestation, health, build and canonical-alias provenance, and staging release-gate E2E;
production jobs were skipped. Credit that delivery reliability, not a complete local lane,
offer/terms approval, live paid activation, whole S6 or user acceptance.

PR [#1826](https://github.com/interdomestik/interdomestik/pull/1826) delivered fail-closed localized
Paddle confirmation as protected merge `d2a37205ca8db13e684228c9288dd7bbcbd667ec`. Its
[receipt](https://github.com/interdomestik/interdomestik/pull/1826#issuecomment-5839509942) records
required local/protected checks and automatic staging CD `36185398763`: attempt 1 encountered a
transient network precheck failure and rolled back, while unchanged-source attempt 2 passed exact-main
health and P0.1/P0.2/P0.3/P0.4/P0.6. Production jobs were skipped. Credit its active/complete/localized
gate; do not rebuild it or infer delivery retry, terms acceptance, live activation or user acceptance.

PR [#1825](https://github.com/interdomestik/interdomestik/pull/1825) delivered the signed-in
plan/entity checkout review as protected merge `d5e657da2ed88ac94db93cf4cc55343718c08e08`.
Its [receipt](https://github.com/interdomestik/interdomestik/pull/1825#issuecomment-5834108770)
records required local/protected checks and automatic staging CD `36145768095` with exact-main
health and P0.1/P0.2/P0.3/P0.4/P0.6 passing. Production jobs were skipped. Credit that
presentation-only correction; do not redo its proof or infer terms acceptance, live activation,
whole S6 or user acceptance.

PR [#1824](https://github.com/interdomestik/interdomestik/pull/1824) delivered safe, exact retry of
entity-routed Paddle activation after out-of-order transaction evidence. Its
[receipt](https://github.com/interdomestik/interdomestik/pull/1824#issuecomment-5831196011) records
protected merge `c020c20`, 292 gate and 24 smoke passes, and automatic staging CD `36124511981`
with exact-main health and P0.1/P0.2/P0.3/P0.4/P0.6 passing. Production jobs were skipped.
Credit this bounded fix, not live activation or whole IDA-MEM-006/007 acceptance.

PR [#1823](https://github.com/interdomestik/interdomestik/pull/1823) completed the prior staging
readiness repair on exact main `369bbd0987fab894958f125492aa3df909ecb196`. Protected checks and
automatic staging CD [#36111178342](https://github.com/interdomestik/interdomestik/actions/runs/36111178342)
passed immutable/canonical health and P0.1/P0.2/P0.3/P0.4/P0.6; production stayed unchanged. This
also completes canonical staging for #1822's saved-draft continuation. Both repairs are credited and
closed. Fresh-account first submission still requires the bounded S6 dependency below; whole S5/S6,
business acceptance and production deployment remain outside scope.

PR [#1817](https://github.com/interdomestik/interdomestik/pull/1817) delivered the bounded
`IDA-FST-004` local disclosure as `a5dd1e455628b7c9826c80683237adcbd0d2d4f3`. Following the separate
cached RLS posture-timeout recovery in PR [#1821](https://github.com/interdomestik/interdomestik/pull/1821),
automatic staging run [#36088924719](https://github.com/interdomestik/interdomestik/actions/runs/36088924719)
passed on exact main `9a51d469481a5843b415a5451ad246e51d54048b`, including P0.1/P0.2/P0.3/P0.4/P0.6.
Canonical health established the exact SHA; the release report's metadata probe remained `unknown`.
Production jobs were skipped. The prior task retired its owned worktree and preserved its
[handoff](https://github.com/interdomestik/interdomestik/pull/1817#issuecomment-5826423914).
The disclosure and diagnostic/recovery work are credited and are not active slices.

Earlier #1801 active-member submit/reopen and #1803 new-account OTP save/return/delete proofs
remain credited, as do #1814 request-linked upload/acknowledgement, #1815 membership disclosure and
#1825 checkout review.
They do not establish new-account activation, request fulfilment, whole S5/S6/S7 or pilot admission.

## Program Goals

1. Show staff the member-facing decline wording before they save a categorized decision, using
   the existing member catalog and sensitive-category projection in EN/SQ/MK/SR.
2. Keep the staff-only explanation outside the preview and identify the displayed locale honestly.
3. Restore exact-main staging proof through bounded canonical-host health checks while preserving
   provider mapping, immutable health, exact-SHA and rollback authority.

## Enduring Safety Boundaries

- `apps/web/src/proxy.ts` remains the sole routing, access-control and tenant-isolation authority
  and is read-only unless the owner explicitly authorizes a justified change.
- Canonical routes `/member`, `/agent`, `/staff` and `/admin` must not be renamed or bypassed.
  Contractual `page-ready` and `*-page-ready` markers remain enforced.
- Supabase Auth remains the identity/session system of record, `better-auth` the orchestrator and
  `@interdomestik/shared-auth` the provider-agnostic boundary. Tenant/RLS and document lifecycle
  protections remain mandatory. Authentication must never be bypassed, including in development.
- Paddle remains the only V3 pilot billing provider. No routing, auth, tenancy, domain, schema,
  billing or deployment expansion is implied by a green check or planning entry.
- `README.md`, `AGENTS.md` and architecture documents change only on an explicit owner request.
- Framework and dependency versions come from the workspace manifests, especially
  `apps/web/package.json`; prose must not duplicate a hard-coded framework version.
- Architecture-finalization work is conditional and follows
  [its program](architecture-finalization-program-2026-05-29.md) and
  [tracker](architecture-finalization-tracker-2026-05-29.md) only when explicitly promoted.

## Ordinary Product Delivery

- One bounded protected PR carries scope, acceptance, implementation and required tests. Routine
  promotion, qualification, closeout, status-only and bookkeeping-only PRs are not required.
- Focused feedback supports iteration. Runtime, security, CI/trust or other meaningful behavior
  changes still require `pnpm pr:verify` and `pnpm security:guard`; `pr:verify` includes E2E gate
  evidence for the same source, configuration and environment. Instruction-only work runs the
  current plan/contracts relevant to its changed surface. Protected hosted checks remain separate
  trust evidence and are not replaced by local receipts.
- `pnpm plan:audit` validates the active plan/tracker model and current safety contract. It does not
  parse retired Lean authority or reconstruct historical artifacts. `pnpm plan:audit:legacy` and
  `pnpm test:harness-v2` remain available for explicit legacy work.
- CI runs the retained shared delivery-safety tests on ordinary changes. Full legacy authority and
  Harness validation runs only when a legacy artifact, its actual consumer or its selection policy
  changes, or when explicitly invoked. Incomplete change evidence fails toward running legacy proof.
- `pnpm repo:size:check` growth is advisory except for the retained coarse largest-file and class-aware
  modularity limits. Ordinary source, test and catalog work needs no exact allocation, shared-budget
  update or byte-specific approval. Historical allocations remain evidence for their original work.
- Review the integrated current-head diff, substantive review bodies, inline findings and actionable
  check annotations. Consolidate accepted corrections before one expensive final verification lane.
  Do not transfer proof across changed source, configuration or environment identity.
- Record prepared, tested, merged, deployed and user-validated states separately. A merge never
  implies deployment or user acceptance.

## Model And Review Policy

- Use the least expensive capable owner for the demonstrated risk. GPT-5.6 Sol at appropriate
  reasoning is the normal integration owner; reserve Astra escalation for a concrete unresolved
  gate, security, concurrency, data-loss or cross-domain architecture ambiguity.
- Helper work must be bounded and disjoint. A routine deterministic change needs no fixed panel;
  one relevant subscription helper is sufficient when independent input is useful. Add a distinct
  second perspective for real cross-domain, security or concurrency risk.
- High-risk work retains independent review separate from implementation judgment. The reviewer is
  selected for the risk, not to satisfy a model-brand ritual.
- Reuse accepted helper/reviewer evidence until its inputs change. Verify the actually served model.
  Provider exhaustion may use an approved adequate alternative for low/medium risk without a routine
  waiver ceremony. Never retry solely to repair advisory formatting or use a paid API fallback.
- Helper output is evidence, not authority. Codex remains responsible for source inspection,
  executable tests, dispositions and final integration.

## Product Queue And Dependencies

The detailed SRS and architecture frontier lives in the
[requirement disposition map](requirement-disposition-map.md), which preserves all 510 numbered
clauses and supplementary controls. SRS v0.9 remains the reviewed baseline at SHA-256
`8bc2b69c9babf8f228941378a01a32340f23d3ff061f92c574a9a908472981a2`; repo/program and accepted
ADR authority control until explicitly amended.

Continue the owner-adopted outcome order without rebuilding delivered behavior: remaining
S7 acceptance after delivered #1854 recovery and credited #1847/#1849 decline preview/recovery, #1845 exact fulfilment,
#1842 assigned-staff queue, #1841 shared
next action and #1814 request evidence round trip, with remaining S5/S6 gaps still open,
S8 agent handoff, S9 assisted activation, S10 branch oversight, S11 tenant administration, S12
platform operations and S13 outcome/closure, followed by S14 whole-pilot rehearsal. H1 Help Now
keeps its priority lane when its direct dependencies are ready.

Direct dependencies remain local to their consumers. PR #1836 proves bounded member document
retrieval after #1814 upload and #1835 communication. PR #1815 proves bounded lifecycle/access
disclosure; #1824–#1834 supply credited Paddle activation, provider-order and past-due notification
proof; #1837 supplies the safe mounted payment update and #1838 the factual period/grace display.
This slice does not reopen those billing/event writers or the payment action. Approved effective-dated offer/terms,
delayed-onboarding localization, live paid activation, renewal, invoice and payment-operations
acceptance remain open.
Reviewed signed/versioned/integrity/expiry contracts precede offline pack readiness; S8 precedes
dependent S9; recovery, partner, mandate, consent and billing receipts precede affected S13 promises.
T-411 keeps its T-401, SVC-CORE and FLIGHT-03 dependency chain. No whole-overlay or stale historical
row becomes a blanket pilot gate.

Pilot admission still requires the applicable role journeys, EN/SQ/MK/SR coverage, complete-process
accessibility evidence, truthful contract-backed copy, tenant/role/privacy/data-integrity checks,
operational ownership, incident/restore evidence and explicit release authorization. CI success
alone is not business or user acceptance.

## Current Repair Acceptance

### Delivered staff status/note save recovery acceptance (#1854)

- Preserve selected status, public note and private allowance reason on rejected save transport.
- Show EN/SQ/MK/SR confirmation-unknown guidance; check case history before a manual retry.
- No automatic retry or claim of rollback. Keep existing known-negative and acknowledged-success behavior.
- Catch only action rejection; do not relabel a later refresh exception as an unconfirmed save.
- Preserve action arguments, tenant/RLS/auth, proxy, routes and page-ready contracts.
- Consolidate focused regressions and independent/current-head analysis before one full local lane.
- Record elapsed start-to-staging, full verification attempts/reasons, actual Claude coding/model,
  integrator corrections and defects found after final review in the existing PR receipt.
- Protected checks and exact-merge staging passed for #1854. Whole S7 and human acceptance stay open.

### Credited #1846 safe-decline handoff acceptance

- A conflict/integrity decline retains its internal category and staff explanation for authorized
  staff, while the member DTO/hydration exposes only a neutral category. A caller-supplied public
  note cannot place an accusation on the member timeline; the generic notice is used instead.
- The mounted member decision shows accepted/declined status and reason in EN/SQ/MK/SR, with the
  existing support route as the declined next action. Time-limit copy states concern based on
  available information without declaring a statutory deadline. The staff summary is localized.
- Focused privacy/projection and four-locale mounted tests, independent review and required final
  verification are required. Proxy/auth/RLS, claim transition authority, billing and provider
  writers remain unchanged. This does not implement a conflict hard stop, automatic escalation,
  whole `IDA-CLM-011/013/015`, whole S7 or user acceptance.
- Claude Pro Sonnet 5 supplied a source-free TypeScript security helper on the authenticated
  first-party subscription route; Codex corrected its note-trimming bug and integrates/tests it.
  No private diff or paid API transfer is authorized.

### Credited #1834 past-due recovery acceptance

- The entity-scoped, signature-valid ordered `subscription.past_due` path commits its existing
  counter/marker, one deterministic tenant/event audit and immutable Day 0 email intent atomically.
  Audit or intent persistence failure rolls the entire write back.
- Exact replay recovers only an existing pending intent; it never increments again, reconstructs
  a request from changed member data or sends again after a recorded acknowledgement.
- Recovery locks the canonical tenant/subscription row through send and acknowledgement. A newer
  lifecycle marker suppresses the pending notification; stale events create no new effect.
- The full request and provider idempotency key remain fixed. Recoverable delivery uses Resend
  dedupe, never arbitrary SMTP. A missing sender or negative/ambiguous result remains retryable.
  Automatic attempts stop at 23 hours from intent creation, within the provider's 24-hour key
  retention; unresolved acceptance then requires reconciliation and never a fresh key.
- Preserve existing missing-email/Day 0-only behavior. No reconstruction of pre-fix lost intents,
  new scheduler, migration, pricing/terms, renewal operations or unscoped legacy-route change.
- Focused fault injection and actual non-bypass PostgreSQL transaction/tenant proof, one independent
  review and one consolidated required verification lane precede protected delivery. Exact-main
  automatic staging is separate evidence; no charge/provider mutation or production deployment.

### Credited #1830 provider-event-order acceptance

- The entity-scoped lifecycle path requires the signed top-level RFC 3339 `occurred_at` (at most
  microsecond precision) and `event_id`. Missing or invalid evidence is a permanent ordering failure
  before any subscription, entitlement, event, audit or confirmation side effect; the receipt
  terminates as a non-retryable error. The unscoped legacy route is unchanged.
- Order is scoped to the exact provider subscription row in its canonical tenant. A row holding a
  different provider subscription is never compared against this event's time.
- The write transaction locks the tenant-scoped row, compares `occurred_at` in Postgres at
  microsecond precision and commits `provider_event_occurred_at`/`provider_event_id` with the
  snapshot and deterministic domain event. An older event is a safe no-op whose receipt completes;
  an older event whose own snapshot already committed is a replay that may finish idempotent effects.
- A newer event applies normally; exact replay is idempotent; a distinct event at an equal
  `occurred_at` is ambiguous and fails permanently without choosing a winner or mutating state.
- Additive migration `0095_subscription_provider_event_order` adds the two nullable marker columns
  and a both-or-neither check. Rows without a marker derive their floor from signature-valid,
  processed lifecycle receipts in the exact same entity processing scope, tenant and provider
  subscription; an unusable or equal receipt fails closed, so deployment creates no fail-open gap
  and another entity or the unscoped route never becomes the floor.
- Entity-scoped `subscription.past_due` follows the same contract. It requires the exact existing
  provider-subscription row in its tenant (missing rows retry; it never creates or replaces a first
  row), and derives dunning counters from the locked row while committing them with the marker.
  Stale or replayed `past_due` increments nothing. The current recovery increment preserves completed
  effects and recovers only an exact pending notification; stale events emit no new effect.
- The ordering decision precedes any confirmation-store access. Stale events emit no
  `membership.subscription_changed`, subscription audit, extras, confirmation claim, readiness or
  send; an applied or exactly replayed `subscription.created` keeps #1827 prepare/recover/deliver
  behavior. #1829 first-activation order integrity and retryable receipt semantics are preserved.
- Focused tests, independent current-head review, required verification and protected hosted checks
  precede merge; exact-main staging is separate evidence. No charge or provider mutation is made.
- Renewal and dunning operations beyond protecting the existing `past_due` event, approved
  offer/terms, live provider evidence, whole S5/S6, IDA-CTR-023/IDA-MEM-007/008/009, user acceptance
  and production deployment remain open. The unscoped legacy route is explicitly out of scope.

### Credited #1829 provider-order integrity acceptance

- A first entity-scoped subscription row requires `subscription.created`; an otherwise valid signed
  `subscription.updated` without an established row remains retryable and grants no access.
- The causal `transaction.completed` receipt must be signature-valid, processed successfully and in
  the same entity scope. Its transaction/subscription/customer IDs, completed status, currency,
  price/quantity multiset and calculated line totals must exactly match the subscription event.
- A missing or still-processing causal receipt defers before writes. Malformed, failed or conflicting
  evidence fails closed. Existing tenant/custom-data and Paddle customer lookup constraints remain.
- An out-of-order transaction can persist invoice/ledger evidence without pointing at a provider ID
  that is not yet an internal subscription row. Only a resolved stored row may populate that foreign key.
- The KS browser gate proves the obsolete synthetic update now leaves the verified member's saved
  draft blocked, creates no subscription/lifecycle event/claim and records a retryable receipt.
- Protected merge and exact-main staging CD `36247906583` are credited above. No charge or provider
  mutation was made.
- Expected-order comparison against an approved effective-dated offer/entity/versioned terms,
  actual paid-service approval, live provider evidence, deployed MK secret/entity-token permission,
  whole IDA-CTR-022/IDA-MEM-006/007, user acceptance and production deployment remain open.

### Current source check

- Checked 2026-09-26: Paddle's [webhook guide](https://developer.paddle.com/webhooks/about/how-webhooks-work/)
  and [response guidance](https://developer.paddle.com/webhooks/about/respond-to-webhooks/) state
  at-least-once delivery, `event_id` as the dedupe key and no guaranteed delivery order. The
  [notification reference](https://developer.paddle.com/api-reference/notifications/get-notification/)
  defines `occurred_at` as the RFC 3339 time the event occurred and `data` as the entity snapshot at
  that time. Adopt signed `occurred_at` per provider subscription as the ordering key. Reject arrival
  time, `notification_id` and any `event_id` lexicographic tiebreak; equal times stay ambiguous.

### Reused #1829 source check

- Checked 2026-09-26: Paddle documents `transaction_id` on
  [`subscription.created`](https://developer.paddle.com/webhooks/subscriptions/subscription-created/)
  and `subscription_id`, customer, currency, completed status and calculated totals/line items on
  [`transaction.completed`](https://developer.paddle.com/webhooks/transactions/transaction-completed/).
  Adopt those fields as the causal provider-order integrity boundary.
- Paddle's official
  [access-provisioning guidance](https://developer.paddle.com/build/subscriptions/provision-access-webhooks/)
  makes provider webhooks, not browser continuation, authoritative. Reject first activation from a
  lifecycle update alone, while preserving later verified updates for an established row.
- The repository manifests remain dependency-version authority. The reviewed SRS OD-01 decision
  describes a governed versioned offer catalogue, but does not supply or authorize a runtime pilot
  offer. Therefore compare provider evidence internally now and keep expected offer/price/terms open.

### Credited #1826 membership-confirmation safety acceptance

- The self-service checkout records only a validated EN/SQ/MK/SR locale in Paddle custom data; URL
  tenant values remain non-authoritative and the established signed webhook boundary is unchanged.
- Only `subscription.created` with exact provider status `active` and complete provider plan name,
  amount/currency, cadence and current billing period can dispatch active-membership confirmation.
  Trialing, past-due, paused, canceled/deleted and unknown states send no active confirmation.
- Missing locale, plan, price, period, member number/name/email or tenant-safe route sends no
  confirmation. No local price/date/member, plan, interval or locale fallback is permitted.
- The email renders truthful EN/SQ/MK/SR provider status/values and separate saved-case submission
  next steps. The prior unsourced benefits/refund/protection claims and generated PDF are removed.
  Manual resend remains disabled until an immutable provider confirmation snapshot exists.
- Existing verified transaction deferral, duplicate receipt short-circuiting and tenant-conflict
  failures occur before confirmation dispatch. Email delivery failure is not logged as success.
- Focused tests, independent integrated review, required verification and protected hosted checks
  precede merge; exact-main automatic staging is separately evidenced.
- The final protected merge/staging receipt is credited above. No approved offer/terms, immutable
  delivery receipt, retry guarantee, automatic entitlement, case submission, whole IDA-MEM-006/007,
  user acceptance or production claim followed from #1826.

### Credited #1825 member checkout review acceptance

- Signed-in standard/family selection opens the existing focused plan/entity review before Paddle.
  Cancel restores focus; reselect and deliberate initialization retry retain the exact selected plan.
- Explicit continuation preserves configured identity/entity authority. Initialization locks controls;
  anonymous OTP, assisted business, pending-session and pilot controls remain unchanged.
- The exact-main staging receipt is credited above. No accepted terms/version/snapshot, live
  activation, whole S6, user acceptance or production claim followed.

### Credited #1824 provider-activation retry acceptance

- A verified entity-routed anonymous `subscription.created` whose related processed
  `transaction.completed` is not yet available fails before user/subscription writes and records a
  typed retryable result.
- Redelivery reclaims only the exact signature-valid failed row in the same entity processing
  scope and with the same payload hash. The compare-and-set permits at most one concurrent claimant.
- Reconciliation consumes only a signature-valid, successfully processed Paddle transaction from
  the same billing scope. Its customer ID must equal the subscription customer ID, and the
  entity-configured Paddle client must return that same active customer with a valid email.
  Missing/unsupported tenant context, archived customers, foreign ownership and conflicting
  provider metadata remain fail-closed and are never classified by error-message text.
- Once authoritative context exists, the established tenant-scoped writer creates or updates one
  subscription and preserves the current active/trialing lifecycle access contract. A later replay
  is a duplicate and performs no second entitlement, invoice, ledger or lifecycle event write.
- Browser success/query state remains non-authoritative. No schema, proxy, route, auth, RLS, price,
  offer, terms acceptance, entity snapshot or production configuration change is introduced.

### Credited #1822 product acceptance

- A clean confirmed, complete, preview-ready vehicle/property secure draft exposes one explicit continuation action with
  EN/SQ/MK/SR copy stating that membership and separate submission remain necessary. Dirty,
  pending, conflicted, failed or deleted drafts expose no continuation action.
- Only the opaque UUID travels in the URL fragment; no facts, authorization or entitlement travels
  with it. The existing canonical route/query, proxy, page-ready and membership checks are unchanged.
- The receiving intake resolves the exact ID through the existing authenticated resume action.
  Pending reads block editing. Invalid, missing, foreign and refused reads reveal no draft facts;
  generic failure and keyboard-accessible retry preserve the same ID and perform no writes.
- Successful load focuses the review heading. The existing manager-only membership explanation and
  disabled submit remain for an account without membership; an eligible member retains the existing
  deliberate-submit and idempotent confirmation behavior.
- The real-OTP journey continues the newly verified owner's exact saved facts in all four locales,
  retaining zero claims/subscriptions/CRM leads and exact cleanup. Existing owner/tenant isolation,
  save/return/delete and active-member submit/reopen evidence remains credited.
- Full new-account activation/submission, broader category journeys, complete-process accessibility,
  authorized business review and user/operational acceptance remain open. `IDA-MEM-006` requires a
  verified provider event or reconciled authoritative transaction, never a browser-success grant.

### Credited PR #1816 diagnostic acceptance

- The exact-preview health/SHA preflight verified PR #1803 SHA
  `12699481a1e1f3e231ca6c13844d4152125d02e4` in `preview`, then the sanitized browser receipt
  reported `panel-visible` in run #36003798077.
- The diagnostic permitted safe reads plus canonical login, blocked role and monitoring mutations,
  and made no staging retry or deployment claim. It is closed diagnostic evidence, not root-cause,
  production, pilot-admission or user-acceptance evidence.

### Credited PR #1803 acceptance

- The PR E2E lane runs a pinned Mailpit service on loopback. Only sign-in OTP mail opts into it;
  invalid or unavailable catcher configuration fails without falling back to an external provider.
- A native Chromium request from the explicit `ida.localhost` test origin verifies the delivered
  code, receives an HttpOnly session and persists the exact eligible facts. No request interception,
  Origin rewriting, CSRF/origin bypass or production trusted-origin expansion is permitted.
- A cookie-free, valid-code request from an untrusted Origin is rejected before rate limits or the
  Better Auth handler and does not consume the code; wrong-code and consumed-code replay attempts
  also fail closed. Retained Playwright trace, video and screenshot capture is disabled for this
  secret-bearing proof and errors redact every retrieved code.
- The verified owner can return in a fresh browser, resume exact facts and permanently delete the
  draft with create/delete audit evidence. A foreign tenant sees `notFound`; no claim, subscription
  or CRM lead is created. Whole S5, operations and user acceptance remain open; bounded `IDA-FST-004` delivery is credited above.
- Focused contracts, independent high-risk review, `pnpm pr:verify`, `pnpm security:guard` and
  protected current-head checks pass before delivery. No whole-SRS, pilot-readiness,
  user-acceptance or production-deployment claim follows.

## Bounded Research Brief

Checked 2026-10-01 for message-read continuity: [PostgreSQL SET LOCAL](https://www.postgresql.org/docs/current/sql-set.html)
limits settings to the current transaction; [Drizzle transactions](https://orm.drizzle.team/docs/transactions)
execute related queries through the supplied transaction. The existing repository tenant helper
already establishes this boundary. Adopt that helper for dependent message operations; reject
global session settings, privileged read fallbacks and RLS-policy changes. A real local
NOBYPASSRLS connection reproduces `Claim not found`, while the same claim is visible inside
the tenant transaction. Verify public/private visibility and recipient receipts with real RLS.
The owner-held SRS v0.9 checksum matches the recorded baseline; read IDA-COM-005 and
IDA-CAS-006/008 without claiming their full completion.

### Credited status-save research

Checked 2026-09-30: [React transition error handling](https://react.dev/reference/react/useTransition#displaying-an-error-to-users-with-error-boundary)
states that a rejected transition promise reaches an error boundary. The mounted status-save
handler lacks a local catch; direct callback reproduction confirms escaped rejection and no local
feedback. Adopt a catch scoped to the action await, preserving drafts and showing confirmation-unknown
copy. Reject automatic replay: losing a response does not prove whether the write committed.
Verify real React transitions, known-negative results, manual retry and acknowledged-success refresh
separation. Reuse IDA-CAS-006/007/008 public/private semantics and IDA-NFR-007/008 localization/usability
from the [SRS v0.9 disposition](requirement-disposition-map.md); full clauses remain open.
Carry only reproducible agent/preflight sources, not private packets or raw closeout archives.

### Credited decline research

Checked 2026-09-29: the owner-held SRS v0.9 source matched SHA-256
`8bc2b69c9babf8f228941378a01a32340f23d3ff061f92c574a9a908472981a2`.
`IDA-CLM-013` requires restricted integrity signals without a member accusation, and
`IDA-CLM-015` calls for a categorized plain-language decline and appropriate next option. The
mounted recovery decision already saves categories, but its member card uses English domain copy
and the status writer accepts a caller-supplied public note even for a sensitive category. Reuse
[W3C status-message guidance](https://www.w3.org/WAI/WCAG21/Understanding/status-messages)
for a clear decision result and [ICO criminal-offence data guidance](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/criminal-offence-data/)
as a disclosure-minimization caution where an integrity note could contain an allegation; this is
an inference for the product, not a classification of every conflict note. Adopt a neutral public
projection, generic sensitive timeline note, localized decision and existing support path. Reject
new legal-deadline calculation or a new conflict-disposition workflow. Expected benefit: members
understand the decline and a next step without seeing restricted staff reasoning. Verify sensitive
data absence from public DTO/timeline, four locales and unchanged authorized decision behavior.
The owner's described public/member PWA direction informs the clear next action and restrained card
hierarchy here; its attached image was unavailable in this checkout and is not claimed as inspected.
German diaspora-language support remains a design requirement to reconcile with the current
EN/SQ/MK/SR pilot contract, not a localization delivered by this slice.

### Credited #1845 request fulfilment research

Checked 2026-09-29: the owner-held SRS v0.9 DOCX matched SHA-256
`8bc2b69c9babf8f228941378a01a32340f23d3ff061f92c574a9a908472981a2`.
`IDA-CLM-010` requires a specific request and responsible owner; its acceptance calls for
authorized, denied, malformed, boundary and retry/concurrency proof. Reuse #1841's applicable
[W3C status-message guidance](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html)
for clear mounted feedback. The #1814 upload association and acknowledgement, #1841 shared next
action and #1842 queue are already delivered. Adopt an explicit assigned-staff confirmation tied
to one acknowledged upload and a persisted fulfilled result; reject automatic fulfilment from an
upload or acknowledgement alone, and reject a claim lifecycle/SLA change. Expected benefit:
both roles can see when the exact request is complete without losing its evidence trail. Verify
tenant/owner denial, stale or unrelated document conflict, concurrent retry, four-locale next
action and unchanged claim lifecycle.

### Credited #1842 assigned-staff queue research

Checked 2026-09-29: the owner-held SRS v0.9 source matched SHA-256
`8bc2b69c9babf8f228941378a01a32340f23d3ff061f92c574a9a908472981a2`.
`IDA-CLM-010` requires a saved request, date and owner; `IDA-CLM-012` requires uncertainty
escalation rather than a calculated statutory deadline; `IDA-COM-008` requires a governed overdue
task escalation path beyond this queue. The [Allianz public claims portal](https://apac.claims.booking.allianz-assistance.com/)
offers file/complete and track-claim entries, but its public page does not expose a staff queue;
adopt clear action separation, reject any claim that its staff workflow was inspected.
The [GOV.UK task-list guidance](https://design-system.service.gov.uk/components/task-list/)
supports short action/status labels and grouping when useful. Adopt two clear next-actor groups
within the existing claims list and a saved-date operational follow-up prompt; reject an invented
timer, legal deadline, automatic escalation or new task writer. Expected benefit: assigned staff
can distinguish work ready for review from member evidence waits and identify a dated follow-up.
Verify persisted-state grouping, due-date boundary, mixed requests, tenant/owner denial, four-locale
mounted labels and unchanged lifecycle.

### Credited #1841 evidence next-action research

Checked 2026-09-28: the owner-held SRS v0.9 `IDA-CLM-010` clause requires a specific request,
due date, responsible owner, member explanation and SLA posture. The mounted #1814 request card
already shares reference/date/progress, while its open status and next actor are implicit. Reuse
the still-applicable [W3C status-message guidance](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html)
and the previously checked member communication brief for visible feedback. Adopt explicit status
and next action on the shared card; reject automatic fulfilment, a new legal deadline and a new
staff writer. Expected benefit: both roles can identify who acts next without mistaking upload or
acknowledgement for completion. Verify four-locale mounted transitions, failed reads, ownership
isolation and unchanged claim/request state.

### Credited Free Start research

Checked 2026-09-28: the owner-held SRS v0.9 DOCX matched its recorded SHA-256 and its
`IDA-FST-014` clause requires the information-organizing purpose and four explicit service
exclusions. Inspected the mounted Free Start catalogs: no-case and no-payment language exists,
but representation, claim acceptance, insurer submission and professional advice are not all
made clear at the organizer and result. [W3C WAI clear visible labels](https://www.w3.org/WAI/WCAG2/supplemental/patterns/o4p06-clear-labels/)
supports plain visible wording near the relevant action. Adopt a concise visible four-locale
boundary on the two mounted surfaces; reject a new workflow, automatic handoff or a legal-review
claim. Expected benefit: a member can distinguish preparation from a professional or insurer
action. Verify mounted visibility, locale parity and existing result/save continuity.

### Credited payment-method research

Checked 2026-09-28 against Paddle's
[payment-method transaction endpoint](https://developer.paddle.com/api-reference/subscriptions/get-subscription-update-payment-method-transaction/),
[default payment link guidance](https://developer.paddle.com/build/transactions/default-payment-link/)
and [update-payment guide](https://developer.paddle.com/build/subscriptions/update-payment-details/)
for the installed Paddle SDK. The endpoint supports automatically collected active/past-due
subscriptions: past due returns its most recent past-due transaction; active creates a zero-value
method-change transaction. `checkout.url` uses the approved default payment page and `_ptxn`.
Adopt exact member/tenant/provider subscription and customer matching, status-consistent transaction
evidence, exact configured entity payment-page path and transaction ID matching. Reject arbitrary
HTTPS destinations, redirect/checkout success as entitlement and an invented renewal or grace rule.
Expected benefit: an eligible member can retry safely without exposure to another transaction or
misleading access claims. Test owner/tenant/role denial, malformed/mismatched transaction and URL,
past-due/active states and accessible localized failure/retry.

Checked 2026-09-26 against Paddle's official webhook, webhook-response and get-notification
references. Delivery is at least once and unordered; `event_id` deduplicates, and `occurred_at` with
the `data` snapshot is the documented ordering evidence. Adopt per-aggregate signed-time ordering,
an atomic row-locked marker, stale no-op termination and permanent equal-time/invalid-evidence
failure. Reject arrival-order, notification-id or event-id winners. Expected benefit: an unordered or
replayed older lifecycle event cannot reverse a newer verified entitlement. Test older-after-newer,
newer-after-older, replay, equal time, invalid evidence, aggregate isolation and interleaving.

#1829 checked 2026-09-26 against Paddle's official subscription-created, transaction-completed
and access provisioning references. Adopt causal transaction linkage, exact provider identities, completed
status, currency, price/quantity multiset and calculated total consistency. Reject entitlement from
an initial lifecycle update, inferred line prices, browser/mail success and any claim that provider
internal consistency equals approval of the expected commercial offer.

Checked 2026-09-25 against the installed Paddle/Resend SDKs, signed webhook path and current SRS map.
[Paddle's webhook delivery guidance](https://developer.paddle.com/webhooks/about/respond-to-webhooks/)
requires duplicate-safe processing because delivery is at least once and may be retried; its webhook
guide also warns that events can arrive out of order. [Resend's idempotency contract](https://resend.com/changelog/idempotency-keys)
deduplicates the same request payload and key for 24 hours and rejects a reused key with different
content. Adopt a tenant-scoped immutable first snapshot, compare-and-set failed retry and a stable
provider key; reject mutable reconstruction, successful/manual replay and claims of indefinite
provider dedupe. Expected benefit: a transient delivery failure can retry without changing the
authorized member/provider facts or normally sending twice. Test first-send, failure/retry, changed
member data, contradictory event evidence, concurrent claim, tenant scope and successful replay.

### Reused #1826 research

[Paddle's `subscription.created` reference](https://developer.paddle.com/webhooks/subscriptions/subscription-created/)
defines provider status, customer-visible price name, lowest-denomination amount/currency, billing
cycle, current billing period and custom data on the signed event. Its active item status means the
item is not in trial; [Paddle's trial guidance](https://developer.paddle.com/build/trials/extend-activate-change-date-trials/)
separately states that checkout with a trial creates a `trialing` subscription and later changes it
to `active`. Adopt exact active-state gating and the provider/member values already present; reject
fallback reconstruction, trial-as-active confirmation, marketing/benefit claims and unsafe resend.
Expected benefit: a member receives a confirmation only when its displayed facts are traceable to
the signed provider state, with localized separate-case next steps. Test non-active/missing values,
four locales, out-of-order retry, duplicate receipt and tenant conflict. #1826 delivered that bounded
gate; it does not approve the commercial offer or prove whole IDA-MEM-006/007.

G06's SHA-256 matches the release manifest, but its July T-503 ratification references MINSAS
terms (Lithuanian operator, Stripe/app stores) and MK conditions effective June 2021 (prorated refund,
registration activation). These do not resolve current Paddle pilot offer/version/effective-date
approval and conflict with current product behavior. Keep them historical; owner selection of a
current approved package remains required for actual terms capture. The owner reconfirmed Paddle-only.
Paddle business-model acceptance, the unresolved MK webhook secret and deployed entity-token
`customer.read` permission remain separate operations/business evidence, not delivered by this UI fix.

### Reused #1825 research

Checked 2026-09-25. [W3C financial error-prevention guidance](https://www.w3.org/WAI/WCAG22/Understanding/error-prevention-legal-financial-data.html)
supports reviewing/correcting before financial commitment. #1825 applied the existing review to
signed-in self-service members and retained cancel/reselect/retry proof without creating offer or
terms acceptance. Its exact-head and exact-main evidence remains credited and is not rerun here.

### Reused #1824 research

Checked 2026-09-25 against current source, installed manifests and the SRS v0.9 membership clauses.
[Paddle's webhook guide](https://developer.paddle.com/webhooks/about/how-webhooks-work/) says events
may arrive out of order and identifies `subscription.created` as the subscription-recording event and
`transaction.completed` as completion of provider processing. The
[subscription-created reference](https://developer.paddle.com/webhooks/subscriptions/subscription-created/)
binds that event to its causal `transaction_id`; Paddle signature verification remains mandatory.
[Paddle's get-customer reference](https://developer.paddle.com/api-reference/customers/get-customer/)
provides the authoritative customer email and active/archived status and requires `customer.read`;
current deployed entity-token permission is an unverified operations dependency, not a source claim.
The [Paddle error contract](https://developer.paddle.com/api-reference/about/errors/) distinguishes
retryable provider 5xx/rate-limit failures from permanent authentication, permission, validation and
not-found failures.
Adopt an exact, typed pre-write deferral plus compare-and-set retry. Reject generic failed-event retry,
browser-success activation, cross-scope transaction lookup, message-based error classification and
mutable tenant data as proof of checkout-time terms. Test focused failure/replay/isolation and retain
protected full verification. The expected benefit is recovery from documented provider event ordering
without duplicate entitlement; no complete `IDA-MEM-002`–`005` or whole-S6 claim follows.

### Reused saved-draft research

Checked 2026-09-25 against installed workspace manifests and the SRS v0.9 source clauses.
[ADAC's public online claims description](https://www.adac.de/produkte/versicherungen/autoversicherung/schaden/)
explicitly supports saving and continuing later; this is a public description, not an inspected
private account or usability test. The earlier generic ADAC URL was unavailable; the specific
claims page was verified instead. [W3C status-message guidance](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html)
supports programmatic loading/error feedback. Adopted inference: explicit exact-draft continuation,
localized loading/failure, blocked editing during load and review focus improve orientation without
implying case creation. Reject auto-submit, copied incident facts in URLs/storage, entitlement grants,
and new offer/payment semantics. Test through mounted four-locale controls, retry/negative cases and
the existing native-origin OTP browser proof. No framework behavior or version change is introduced.

## Historical Evidence

- [Program ledger through PR #1807](history/2026-09-22-current-program-ledger.md)
- [Tracker and proof ledger through PR #1807](history/2026-09-22-current-tracker-ledger.md)
- [Implementation conformance log](2026-03-03-implementation-conformance-log.md)
- [Pre-Rev-243 authority manifest](history/current-authority/2026-08-16-through-rev-243.manifest.json)

These records are immutable evidence inputs, not active queues. The retired Lean projection and
slice runners remain explicit-only and cannot select or block ordinary owner-authorized work.

### Past-due recovery research

Checked 2026-09-27 against the installed manifests and actual handler/receipt/relay implementations.
[Paddle delivery guidance](https://developer.paddle.com/webhooks/about/respond-to-webhooks/) supports
idempotent processing of retried notifications; the local fault-injection test proves the concrete
post-commit gap. [Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys)
retains a key for 24 hours and requires the same request. Adopt existing `engagement_email_sends`
with a frozen request/key, atomic audit and a conservative 23-hour automatic retry ceiling. Reject
arbitrary SMTP retry and treating a provider timeout as proof of non-delivery. The existing domain
relay has no past-due payload/consumer; reusing email storage avoids a new event/relay framework.
Expected benefit: recoverable Day 0 notification and exact audit with no duplicate state/effects;
verify rollback, crash/replay, lock interleavings, tenant isolation and the retry boundary.

### Member communication research and trial

Checked 2026-09-27: [W3C status messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html)
and [name, role, value](https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html). Adopt
programmatic loading/send/error feedback and named refresh/composer controls. Reuse #1777's member
case-continuity design and existing case/action contracts; this is a failure-recovery correction,
not a new operator design. Expected benefit: a failed load cannot masquerade as an empty thread,
and a confirmed send remains visible during refresh failure. Test rejected/negative results,
keyboard controls, polling, stale case responses, four locales and mounted exchange/isolation.
No new framework behavior is assumed; workspace manifests retain version authority.

Trial: two disjoint implementation packages (domain read-receipt predicates/tests; member-only UI,
hook/tests and messaging catalogs); integrator owns contracts, E2E proof and integrated review.
Record actual model identities when exposed, elapsed work, heavy attempts and rework in the product
PR receipt. #1834 baseline: two full-proof attempts (one interrupted before E2E), independent plus
hosted corrections, no blocker escaped to staging. Do not infer speedup from helper concurrency.
