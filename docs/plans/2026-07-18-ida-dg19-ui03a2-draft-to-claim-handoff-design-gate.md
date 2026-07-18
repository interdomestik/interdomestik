---
title: IDA-DG19 UI03a2 Saved Draft to Claim Handoff — Prospective Design
date: 2026-07-18
status: prospective_review_accepted
authority: advisory_until_merged
runtime_authorized: false
promoted_slice: IDA-UI03a2
binding_receipt: ida-ui03a2-design-binding-v0.1.json
risk_tier: 3
base_sha: 19657387e6da32a77e2355997e840b2b763280f4
owner: platform + product + security + privacy + accessibility + qa
---

# IDA-DG19 — UI03a2 Saved Draft to Claim Handoff

## Promotion decision

Promote exactly one prospective Tier 3 implementation slice:
`IDA-UI03a2 — deliberate, zero-repeat handoff from an eligible saved Free Start draft
to member claim creation`.

This document is a docs-only promotion. It authorizes no product, schema, RLS,
migration, runtime, rollout or deployment work. Runtime may begin only after this gate
merges, canonical main and the dedicated worktree resolver both select only
`IDA-UI03a2`, AI OS is freshly observed, and the delegated orchestrator records a
separate exact runtime-authority disposition. Pre-promotion resolver truth was
`blocked_requires_current_authority / umbrella_without_concrete_promoted_slice /
activeSlice=null` at the clean base SHA above.

## User outcome and measurable target

The same verified owner of a complete saved vehicle/property Free Start draft can review
the six authoritative saved facts and deliberately create the corresponding member claim
without typing any fact again. Opening review creates nothing. Confirmation creates at
most one claim, only when current membership entitlement remains valid. The source draft
is neither deleted nor mutated.

The principal proof surface is one saved-draft list item and its review/confirm state.
Repeated saved-fact entry improves from six fields to zero. A deterministic fresh-session
E2E asserts all six copied facts and a bounded usability task measures that no fact input
is required between opening review and confirmation.

## Existing authority retained

- Supabase Auth remains identity/session system of record, Better Auth remains the active
  orchestrator, and `@interdomestik/shared-auth` remains the provider-agnostic boundary.
- UI03a1 owner/access-tenant RLS, stable owner identity, versioned save/resume/manage,
  hard delete and content-free draft audit remain unchanged.
- Canonical default-home and authoritative access-tenant resolution stay server-only.
  The action accepts no owner, tenant, membership, claim, agent or branch selector.
- Existing subscription lifecycle remains authoritative. A saved draft, successful review
  load or prior attempt never proves active membership, coverage, acceptance or a case.
- Existing claim `origin` and `origin_ref_id` columns carry the authoritative source
  linkage. No new identity, session, tenant, case, membership or claim architecture is
  introduced.

## Exact interaction

1. Only a complete owner-visible `vehicle` or `property` draft exposes the quiet secondary
   action `Review and create claim`. Incomplete, unsupported or unavailable states explain
   the next valid action without promising a claim.
2. Opening the review performs a fresh server read of session, owner, default home,
   access tenant, draft and current membership. It creates no claim, event or audit row.
3. The review lists the six authoritative draft facts, says confirmation creates the
   claim, and says the saved draft remains separately editable/deletable. There is one
   explicit confirm button and no preselected consent checkbox or automatic submission.
4. Confirmation accepts only draft UUID, expected version and supported locale. The
   server re-resolves every authority and ignores client-rendered fact values.
5. Success links to the canonical member claim surface and retains the draft in the saved
   list with a `Claim created` link. Retry or a second tab returns that same claim.
6. Editing the draft later does not rewrite the claim. Deleting the draft later deletes
   only the draft; the claim retains its copied facts and historical source identifier.
7. Public SQ uses plain Albanian and never uses `triazh` or `intake`. SQ/EN/SR/MK carry
   equivalent no-coverage/no-acceptance truth. German remains excluded.

## Transaction, linkage and race contract

Confirmation runs in one tenant-scoped database transaction with the authenticated actor
set. Lock order is fixed: the current subscription row is locked `FOR SHARE`, then the
owner/access-tenant draft row is locked `FOR UPDATE`.

After both locks, the transaction:

1. re-evaluates the existing subscription lifecycle and stops if membership is not active;
2. rejects a missing owner/access-tenant match, unsupported category, incomplete facts or
   expected-version mismatch without disclosing another owner's state;
3. looks for the same-owner/same-tenant claim with `origin='free_start_draft'` and
   `origin_ref_id=<draft UUID>` and returns it when present;
4. otherwise inserts one claim whose six mapped facts are copied from the locked row, then
   performs the existing claim-number, submitted-lifecycle, domain-event and content-free
   audit work exactly once for the winning insert; and
5. commits without updating or deleting the source draft.

The draft-row lock serializes concurrent confirmation attempts before the existing-claim
check. A partial unique index on `(tenant_id, "userId", origin, origin_ref_id)` for
`origin='free_start_draft'` is the database backstop, not the primary race algorithm.
Any unique conflict is re-read and returned only when it matches the same authenticated
owner and tenant; it never exposes a foreign claim. No upsert silently changes a claim.

The copied claim fields are deterministic: category maps exactly; counterparty maps to the
existing company field; incident date enters the existing lifecycle input; locale selects
a fixed title and structured description that contains all six normalized facts. There is
no new mutable JSON snapshot. Existing claim fields remain authoritative after creation.

## Honest states and lifecycle

- `Incomplete`: no handoff action; resume the draft first.
- `Membership required`: fresh entitlement failed; no claim exists because of this attempt.
- `Draft changed`: expected version is stale; reload current facts and review again.
- `Creating`: confirm is disabled and announces progress without claiming success.
- `Already created`: retry/race returns the linked authoritative claim.
- `Unavailable`: generic recoverable error; no durable-success assertion.
- `Created`: canonical claim link is present; the source draft still exists.

The source remains ordinary UI03a1 data until its owner explicitly edits or deletes it.
The claim is an independent canonical record containing the copied facts. Later draft edit
or delete never mutates or deletes the claim, and later claim activity never mutates the
draft. The historical `origin_ref_id` may remain after source deletion; there is no foreign
key or cascade promise.

## Operator benchmark, observed 2026-07-18 UTC

1. GOV.UK Check answers establishes a review-before-submit pattern and clear change links:
   `https://design-system.service.gov.uk/patterns/check-answers/`.
2. Progressive explains deliberate online claim reporting and current policy/coverage
   context: `https://www.progressive.com/claims/faq/how-to-report-a-claim/`.
3. State Farm exposes a clear start/track claim boundary without treating entry as claim
   acceptance: `https://www.statefarm.com/claims/auto`.
4. GEICO separates online claim reporting from later handling/status:
   `https://www.geico.com/claims/claimsprocess/online-claim-reporting/`.

Comparison criteria are repeated fact entry, review/consent clarity, entitlement truth,
retry/race idempotency and source lifecycle. The design adopts principles only. It must not
copy operator wording, page structure, branding, interaction sequence or trade dress.

## Accessibility, responsive and JavaScript contract

- Review has a programmatic heading; the opener controls it with explicit expanded and
  labelled state. Focus moves on deliberate open, stale conflict and successful creation.
- Status uses a polite live region; errors use an alert. Facts are a semantic description
  list. Confirm and claim links are keyboard reachable, visibly focused and at least 44 px.
- Confirmation never relies on color or icon alone. In-flight state prevents repeated
  activation without hiding the result of an idempotent retry.
- Mobile 320/360/390/430 px is one column. Desktop 1280/1440 px preserves the current
  saved-draft hierarchy. There is no horizontal overflow at 200% zoom or WCAG text spacing.
- Reduced motion and forced colors remain usable. SQ/EN/SR/MK have message-contract parity.
- With JavaScript disabled, no interactive handoff control or creation promise is rendered;
  the readable saved-draft/member fallback remains truthful. Browser proof covers current
  Chromium, Firefox and WebKit lanes where the repository gate supports them.

## Test-first acceptance cases

- `C01-C03`: incomplete/unsupported/wrong-owner or wrong-access-tenant drafts fail closed;
  the list reveals no foreign existence and exposes no handoff action.
- `C04-C06`: review resolves fresh authority, creates nothing and renders the exact six
  authoritative facts plus source-retention and claim-independence truth.
- `C07-C09`: inactive/cancelled/grace-expired membership blocks both review/confirm as
  defined by the existing lifecycle; an active current row permits confirmation.
- `C10-C12`: stale version, deleted draft and invalid locale/input produce bounded generic
  outcomes without claim/event/audit writes or raw error leakage.
- `C13-C16`: one confirmation copies all six facts, records exact origin linkage, initializes
  claim number/lifecycle/event/audit once and leaves every source-draft byte/version intact.
- `C17-C19`: double click, retry after response loss and two-tab race return one claim id;
  the live partial unique index proves one row and no duplicate lifecycle side effects.
- `C20-C21`: later draft edit/delete leaves claim facts and link history intact; list/delete
  copy truthfully distinguishes the two independent records.
- `C22-C24`: SQ/EN/SR/MK, mobile, keyboard/screen-reader, 200% zoom, text spacing,
  JavaScript on/off and supported-browser behavior pass without `triazh` or `intake` in SQ.

Authoritative database state is proved against real PostgreSQL with RLS/actor context and a
shared-start concurrency latch; timing is never the oracle. Unit mocks alone cannot satisfy
the linkage, entitlement-lock, isolation or race cases.

## Bound implementation envelope

The hard ceiling is at most **18 production/config/i18n/migration files**, at most
**10 test/spec/support files**, at most **4 engineering days**, one visible outcome and
one principal proof surface. The planned allocation is 17 production files:

1. claim schema, one migration, migration journal and snapshot;
2. draft contracts/read linkage;
3. transaction-aware locked subscription helper;
4. one focused draft-to-claim domain service and its package export;
5. one dedicated server action;
6. a smaller saved-draft list, one focused handoff/review item and truthful delete copy; and
7. four Free Start locale files.

The planned test allocation is eight files: migration; live DB/RLS/concurrency; domain;
action boundary; component; locale contract; E2E; and one existing regression adjustment.
Every new or substantially refactored production file stays below 150 lines. If the whole
transaction, one-item surface or acceptance proof cannot fit this envelope, STOP before
runtime work and return exactly one smaller first candidate; do not add a material addendum
or start a second slice.

## Exclusions and stop conditions

Excluded: UI03b different-email recovery; UI03a0c Paddle correlation; uploads, documents,
compression, storage or provider provisioning; injury/health persistence; German;
dashboards or broad member/agent/staff/admin redesign; `proxy.ts`; canonical routes;
auth/session/OTP, tenancy/routing or RLS architecture; Paddle/provider resources; rollout;
deployment; and frozen `IDA-UI01b`.

STOP for a material new protected surface, legal/DPO authority, resource/provider mutation,
deployment, genuine scope expansion, second material addendum, ceiling breach, inability to
make membership and source linkage authoritative inside one transaction, or any need to
silently mutate/delete the source. Automatic CD must be cancelled before deploy. No
production alias or environment change is authorized.

## Review and authority receipts

- The delegated orchestrator accepted `IDA-DG19` and sole `IDA-UI03a2` with the exact
  18/10/4-day ceilings, safety contract, acceptance cases, exclusions and no deployment in
  source thread `019f6586-34cc-7311-900c-9989770f4d29`.
- Correct Gemini 3.1 Pro review found no technical blocker; its preview-only split and
  editable-title suggestions were rejected because they respectively miss the sole user
  outcome and add repeated input. Its stale-diff suggestion is deferred as nonessential.
- Correct Sonnet 4.6 review's FK, RPC/security-definer, event-derived membership and JSONB
  snapshot assumptions were disproved against current source. Its lock, trigger, privacy,
  conflict and locale checks were incorporated. An earlier no-stdin route failure remains
  non-PASS.
- Opus 4.8 escalation's conflict concern is resolved by draft-row serialization before the
  existing-claim check, tenant/owner-scoped uniqueness and winner-only side effects. Its
  fixed lock-order and full-transaction conditions are binding.
- Brain authority and exact-source passes failed closed because its snapshot was stale.
  No savings or usefulness claim is made; `humanUseful` remains unknown until Arben confirms.

Canonical merge plus dual-resolver proof is the only next step authorized by this gate.
