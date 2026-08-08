---
document_id: IDA-DG19-B1-SAVED-DRAFT-CANONICAL-SUBMIT-RECUT
date: 2026-08-08
status: prospective_exact_approval_pending
authority: external_advisory_until_exact_hash_approval_and_docs_only_canonical_merge
base_sha: 3ffe2b52cc2044f78fb7c51425c87a9622042390
parent_gate_sha256: 553921412065bebe92d58aec8eae060b666d7ba2e375a26c8911bb9c7441d430
resolver_before_gate: blocked_requires_current_authority
active_slice_before_gate: null
proposed_slice: IDA-UI03a2-B1
risk_tier: 3
runtime_authorized: false
product_mutation_authorized: false
deployment_authorized: false
production_authorized: false
---

# IDA-DG19-B1 — saved draft to canonical submit recut

## Decision

Propose exactly one smaller product slice:
`IDA-UI03a2-B1 — submit one complete saved Free Start draft through the existing
canonical submitted-claim writer without retyping its six facts`.

This amendment replaces only IDA-DG19's proposed cross-table, single-transaction
handoff mechanism. It does not weaken claim numbering, create an unnumbered claim,
resume frozen `IDA-UI03a2-P0`, or authorize P0 as product work. Instead, confirmation
performs a fresh owner-scoped read of the saved draft, freezes that accepted version as
the submitted snapshot, and invokes the already-shipped canonical `submitClaimCore`
boundary with a server-derived deterministic claim id. That boundary creates a numbered
`submitted` claim with its existing membership, assignment, lifecycle, domain-event,
audit, notification, rate-limit and commercial-idempotency behavior. The deterministic
claim id makes the existing claim primary key the no-duplicate backstop even if the
outer idempotency reservation is deleted after an ambiguous post-commit failure.

This is design authority only. Exact-hash approval authorizes only docs-only canonical
materialization. Product code, branch/worktree creation, runtime, database contact,
provider contact, deployment and production remain unauthorized until the merged gate
is selected by the resolver and a separate exact-main runtime receipt is approved.

## One user outcome

An access-active member can resume one complete saved vehicle/property Free Start draft,
review the same six saved facts, press one explicit submit action, and reach the canonical
created-claim page without retyping. The submitted claim is numbered immediately and the
saved draft remains independently available after exit and re-entry.

No second outcome is included. This slice does not add a claim-created badge to the saved
draft list, editable claim drafts, draft-to-claim synchronization, uploads, or a new claim
workflow.

## Entry, transition and exit state

### Entry

- The actor has a fresh authenticated member/user session, canonical home tenant and
  access tenant accepted by the existing Free Start draft boundary.
- Current membership is active at the existing submitted-claim writer boundary.
- One owner-visible saved draft has category `vehicle` or `property`, expected version,
  preview state, and all six non-empty facts: category, issue, incident date,
  counterparty, desired outcome and bounded summary.
- The browser view has no unsaved edits. If it does, submission is unavailable until the
  user saves or discards them; client-rendered values are never claim authority.

### Single transition

1. The user presses the existing review surface's newly enabled canonical submit action.
2. A dedicated server action accepts only saved-draft UUID and positive expected version.
3. It resolves a fresh session with cookie cache and refresh disabled, requires the same
   actor/home/access-tenant identity as the authenticated action context, and calls the
   existing `resumeFreeStartDraft` owner/access-tenant RLS boundary. Every successful
   read appends one content-free `free_start_draft.resumed` audit row, including a read
   whose expected-version check subsequently fails.
4. Missing, foreign, unsupported, incomplete or version-mismatched state stops before
   claim, lifecycle, event, notification or claim-audit effects.
5. After the owner read, the server derives both deterministic identities from the
   authoritative tenant id, actor id and database-returned draft UUID: idempotency key
   `ida-ui03a2-b1:<draft UUID>` and a 68-character `fsd_`-prefixed SHA-256 claim id. The
   existing unconstrained `text` claim primary key accepts that value without schema work.
   Because `claim` has no RLS, the privileged recovery read is secured solely by explicit
   equality predicates on claim id, tenant id and user id plus the required
   `db-access-guard` annotation. It selects only id and claim number. A match succeeds only
   when `isValidClaimNumber` passes; a foreign, mismatched or malformed row fails closed
   without title, description or existence disclosure.
6. When no existing match exists, the server checks expected version and maps only the
   freshly read six facts into the existing submitted-claim
   input. A fixed code-to-text mapper creates a bounded title and description; no
   client-rendered label or fact value is accepted. Evidence files are exactly `[]`,
   currency is `EUR`, and no claim amount is inferred.
7. The dedicated action applies the existing outer `action:submit-claim` 5-per-600-second
   limiter, then invokes `apps/web/src/actions/claims/submit.core.ts` with both identities.
   That core retains its actor-bound 1-per-10-second limiter and commercial reservation.
   Neither identity is accepted from the client.
8. The existing submitted-claim writer rechecks membership, assigns current branch/agent,
   creates one `submitted` claim, generates its canonical claim number, initializes the
   submitted lifecycle and case-created event, and emits its existing content-bounded
   audit/notification behavior.
9. The dedicated action catches any throw from `submitClaimCore` inside the
   `runAuthenticatedAction` handler, before generic safe-action handling can convert it.
   A throw, ambiguous failure or in-progress loser performs one bounded exact-id/tenant/
   owner re-read. A valid numbered match returns success; absence remains a bounded retry
   outcome.

The authoritative source snapshot linearizes at the successful fresh owner-scoped draft
read. A later independent draft edit does not alter the accepted snapshot or the created
claim. The claim write is intentionally not moved into the NOBYPASSRLS Free Start draft
transaction; therefore it does not require the frozen P0 tenant-code authority. This
recut claims no atomic lock across the two independent records.

### Exit

- Success replaces the review action with the existing localized submitted-success truth
  and a canonical `/member/claims/<claimId>` link; the member can open that claim.
- Same-version double click, two-tab confirmation or response-loss retry uses the same
  server-derived key, request fingerprint and claim primary key. One claim row can win;
  a completed reservation or bounded exact-claim re-read returns its id/number.
- If the source draft changes after the first successful submission, the exact claim-id
  lookup returns the already-created claim before stale/fingerprint handling. It never
  creates a second claim from the later draft version.
- The source draft row, facts and version are never updated or deleted by this transition
  and remain independently resumable, editable and deletable after exit/re-entry. Each
  submit attempt that reaches the successful source read does append the existing
  content-free `free_start_draft.resumed` audit row.

## Why this removes the blocker without weakening authority

The rejected shortcut was to skip `generateClaimNumber` in
`packages/domain-claims/src/claims/create.ts`. Current source proves that shortcut would
create an operational `draft` claim with branch/agent assignment and a `case.created`
event, while `submitClaimCore` would later insert a second row. It would also expose null
claim-number risk to readers such as `AgentClaimsProPage`. This amendment forbids that
path.

P0 exists because original DG19 required claim creation and numbering inside the same
NOBYPASSRLS transaction that locks the saved draft. This recut does not make that
transaction. It reuses two already-established boundaries in sequence: the owner-scoped
RLS draft read and the canonical submitted-claim writer. The accepted expected-version
check defines which saved snapshot the user submitted; deterministic commercial
idempotency coordinates retries and the deterministic claim primary key prevents a
second claim for that draft. No tenant code, claim number, owner, tenant, branch, agent
or source facts come from the client.

The tradeoff is explicit: this slice gives the user the complete submit transition now,
but does not create canonical `origin_ref_id` linkage or claim-created status inside the
saved-draft list. The deterministic claim id is an internal recovery identity, not a new
source-link contract. Source badges and searchable origin linkage are separate future
product capabilities and cannot be inferred from the idempotency record.

## Frozen exact writer map

Production files — exactly six:

1. `NEW apps/web/src/actions/claims/create-from-saved-draft.ts`
2. `MOD apps/web/src/actions/claims/submit.core.ts`
3. `MOD packages/domain-claims/src/claims/submit.ts`
4. `MOD apps/web/src/components/claims/claim-draft-intake/index.tsx`
5. `MOD apps/web/src/components/claims/claim-draft-intake/main-panel.tsx`
6. `MOD apps/web/src/components/claims/claim-draft-intake/dormant-preview.tsx`

Focused test/spec files — exactly five:

1. `NEW apps/web/src/actions/claims/create-from-saved-draft.test.ts`
2. `MOD packages/domain-claims/src/claims/submit.test.ts`
3. `NEW apps/web/src/components/claims/claim-draft-intake/saved-draft-submit.test.tsx`
4. `MOD apps/web/src/components/claims/claim-draft-intake/claim-draft-intake.boundary.test.ts`
5. `MOD apps/web/e2e/gate/member-claim-draft-intake.spec.ts`

No message file changes are needed. The enabled state must reuse existing localized
`claims.wizard.submit_label`, `submit_success`, `submit_failed`, `submit_unexpected` and
`claims.success.go_to_claim` strings; the dormant explanation remains rendered only for
ineligible/unsaved states. Existing Free Start fact labels remain the review labels, not
server inputs.

`main-panel.tsx` is only a prop conduit: it forwards active draft id/version,
`hasUnsavedChanges` and the five existing claims-namespace strings from `index.tsx` to
`DormantPreview`. It owns no action, mapping or state machine.

The boundary-test modification must keep all three component files below 150 lines,
retain the exact three-file local graph, permit only the dedicated action import/call, and
rewrite the obsolete dormant-submit test. It replaces the blanket `createClaim`/
`submitClaim`/`onClick` denials with exact denials of generic claim writers and unrelated
side-effect seams; it must not relax upload, storage, AI, billing, provider,
notification-client or browser-persistence exclusions. The new action remains below 150
lines; `submit.core.ts` remains at or below its current 150 lines; the grandfathered
domain `submit.ts` must be line-neutral or smaller after its one trusted-id substitution.

Any twelfth path, any change to a listed path's role, or any need to modify another package,
schema, migration, RLS policy, claim-number module, generic idempotency module, route,
proxy, locale message or dashboard is scope expansion and must stop before coding.

## Exact action and mapper contract

The new action must remain below 150 lines. The action has one public input:
`{ id: UUID; expectedVersion: positive integer }`.

Its server-only mapper is fixed:

- `category`: exact saved `vehicle` or `property` code;
- `companyName`: normalized saved counterparty, at least two characters;
- `title`: bounded stable text derived only from category and issue codes;
- `description`: bounded stable six-line text containing category, issue, ISO incident
  date, counterparty, desired outcome and summary;
- `incidentDate`: exact saved ISO date accepted by current validation but not separately
  persisted by the current writer; the same date is durably copied into the description;
- `files`: `[]`;
- `currency`: `EUR`;
- `claimAmount`, incident jurisdiction/country and handoff context: absent.

The mapper must pass the existing `CreateClaimValues` validation before calling the
writer. The action may additionally perform the exact tenant/owner-scoped claim-id
recovery read and existing outer rate-limit call. It must not import `createClaimCore`,
`generateClaimNumber`, database admin connections, provider clients, AI, upload/storage
code or notification clients. The web submit core may add only an internal
`trustedClaimId` parameter; the domain submit core may consume only that server-provided
id in place of `nanoid()`, preserving `nanoid()` for every existing caller. The dedicated
action must catch submit-core throws before leaving the authenticated handler. The UI may
call only this dedicated action; it must not call generic `submitClaim` directly or
construct claim payloads in the browser.

## Acceptance tests

1. Complete owner-visible vehicle and property drafts map all six server-read facts into
   valid canonical submitted-claim input, use `files=[]`/`EUR`, persist incident date in
   the description, and return claim id/number.
2. Client input containing extra owner, tenant, facts, claim, number, branch, agent,
   category, amount, file, locale or idempotency fields is rejected by the strict schema.
3. Fresh-session failure, blank idempotency tenant, actor/home/access mismatch, wrong
   owner/tenant, missing draft, unsupported category, incomplete facts, one-character
   counterparty and stale version stop before the canonical claim writer. A successful
   source read appends only its existing content-free resumed-audit row.
4. Membership failure from the existing writer creates no claim and returns truthful
   bounded UI copy; no client path can bypass that recheck.
5. Deterministic idempotency and claim identities are derived only after the owner-scoped
   read and are identical for double click, two tabs, response loss, ambiguous post-commit
   error and later source edit. The claim primary key proves at most one row even if the
   reservation is deleted; completed reservation or exact-id recovery returns its valid
   number. Recovery selects only id/number under explicit id+tenant+user predicates.
6. A permanent `pending` reservation can never expire under current source. The exact-id
   recovery read returns a committed numbered claim when one exists; otherwise the UI
   states that submission remains unavailable and points to the canonical claims list.
   It never promises that waiting alone will clear the reservation.
7. Successful submission preserves every source draft byte and version. Later draft
   edit/delete cannot mutate/delete the claim, and claim activity cannot mutate the draft.
8. The canonical writer still creates lifecycle `submitted`, a non-null valid claim
   number, one case-created/lifecycle set and its current audit/notification path; no
   lifecycle `draft` claim is inserted. The dedicated action applies both current claim
   submission rate limits; automated tests use deterministic limiter doubles because the
   repository disables real rate limiting under automated runs.
9. Focused component proof covers disabled dirty/unsaved/incomplete states, keyboard
   activation, focus, pending status, alert failure, success link and no duplicate
   activation at one 390 px mobile viewport. Existing four-locale message-contract tests
   prove every reused key. Broader viewport/zoom/text-spacing matrices remain unchanged
   regression gates and are not newly expanded in this slice.
10. The focused E2E uses the existing KS member fixture only after preflight proves its
    active subscription, resumes a newly saved draft in a fresh authenticated session,
    reviews all six facts, submits without editing a fact field, reaches the canonical
    claim, then re-enters draft management and proves the source still exists. It records
    the permanent numbered-claim/email residue and performs no fake claim cleanup.
11. Boundary proof keeps `index.tsx`, `main-panel.tsx`, `dormant-preview.tsx` and the new
    action below 150 lines, keeps `submit.core.ts` at or below 150 and domain `submit.ts`
    no larger than its base, permits only the dedicated action in the unchanged local
    component graph, and continues to reject generic claim create/update/submit writers,
    uploads, storage, AI, billing, provider clients, notification clients and browser
    persistence.
12. Focused evidence runs first. Exactly one completed full E2E lane runs in CI on the
    final reviewed PR head; only invalidated evidence reruns after changes.

## Highest-risk cases and bounded treatment

- **Ambiguous failure after claim commit:** the generic idempotency helper deletes a
  reservation when its execute callback throws, while a process crash can leave it
  permanently `pending`. The deterministic claim primary key remains after either case;
  exact tenant/owner re-read returns the committed numbered claim and no alternate id can
  be generated. If that database backstop or recovery read cannot be proven, STOP and do
  not patch generic idempotency in this slice.
- **Concurrent source edit:** an edit committed before the fresh read causes expected
  version failure when no claim exists; an edit after that read is independent and cannot
  alter the accepted snapshot. If a deterministic claim already exists, it is returned
  before stale-version handling. No stronger cross-record atomicity is claimed.
- **Cross-scope key collision:** the key is built only from a database-generated draft
  UUID returned through owner/access RLS. Any evidence that the global action/key index
  permits practical foreign reservation or response disclosure is a stop condition.
- **Privileged recovery read:** `claim` has no RLS. Safety is entirely the action's exact
  id+tenant+user predicates, two-column projection, valid-number requirement and generic
  failure. Missing any predicate, selecting user content or returning mismatch existence
  is a stop condition.
- **Mapping drift:** tests freeze all six fields and reject client labels/values. If the
  existing canonical validator cannot represent the six facts without truncation,
  invention or a new persistence contract, STOP.
- **Membership race:** this recut inherits the existing submitted-claim writer's
  membership and assignment boundary. It does not claim the stronger DG19 subscription
  row lock. If review finds that reuse adds a new authorization regression rather than
  preserving current writer semantics, STOP.
- **Outward residue:** current canonical submission sends the verified member its normal
  notification/email and creates a permanent numbered claim. The final CI E2E therefore
  uses the existing KS member fixture only after active-subscription preflight, asserts
  one exact created claim and does not pretend to delete or clean canonical claim history.
- **Misleading source state:** no claim-created badge/link is shown on the saved-draft list.
  The UI says the draft remains separate; the canonical member claims list is the claim
  source of truth after success.

## Exclusions

- unnumbered lifecycle-draft claims, later draft-to-submitted row transitions and the
  disabled legacy claim-edit route;
- `origin`/`origin_ref_id`, partial unique indexes, source-list claim badges or general
  source-to-claim lookup; the fixed deterministic claim id is authorized only for this
  dedicated server action and exact recovery read;
- frozen P0 and every P0 child, tenant-code authority, migrations, schema, RLS, admin DB,
  migration runner, Docker, Z620 fixture expansion or CI infrastructure;
- completed IDA-UI06a, IDA-UI06b, IDA-UI03b, IDA-UI03a2-P0a2a, IDA-UI03a4,
  IDA-UI03a5, IDA-UI03a6 and PR #1514 absent regression evidence;
- anonymous/inactive-member submit, account merge/transfer, uploads/documents/storage,
  injury/health facts, German, Paddle/provider behavior, Hero redesign, membership
  dashboard redesign, agent/staff/admin redesign;
- `apps/web/src/proxy.ts`, canonical routes, auth/session/OTP, tenancy architecture,
  generic claim-number/idempotency refactors, deployment and production mutation.

## Rollback

Before runtime, discard this ignored candidate or revert only its future docs-only gate
merge. During implementation, revert the exact six production and five focused-test
paths on the dedicated branch. After merge, revert only the product merge; the existing
canonical submit writer, draft persistence, claim numbering, schema and data remain
unchanged. Created claims are ordinary submitted claims and are not deleted or rewritten
by code rollback. No database, provider, alias or production rollback is authorized here.

## Stop conditions

Stop before promotion or coding if:

- current source or implementation evidence finds the sequential owner-read/deterministic-
  id/canonical-submit boundary unsafe or incapable of at-most-one behavior without
  modifying a seventh product path, generic idempotency primitive, schema, RLS policy or
  claim-number authority;
- current source disproves deterministic same-draft key reuse, cached completed response,
  strict actor/tenant response scoping, or no-duplicate behavior;
- the exact six production plus five test paths cannot deliver the transition within
  2–4 active hours, or any seventh production path becomes necessary;
- server mapping cannot satisfy current claim validation using only the six saved facts;
- the UI requires new locale bytes, a route/proxy change, an upload/provider surface, or
  misleading promise about atomicity, source linkage, claim acceptance or coverage;
- AI OS has blocking repo-published drift, the canonical resolver does not select only
  `IDA-UI03a2-B1` after gate merge, or exact runtime receipt approval is absent;
- writer map, one-writer/fresh-worktree discipline, final reviewed head, focused proof,
  sole final-head CI E2E, Sonar, CodeQL, security, feedback, finalizer or CD containment
  cannot be proven exactly.

## Throughput and governed execution

Expected active implementation time is 2–4 hours: approximately 75 minutes server/domain
deterministic-id action and TDD, 55 minutes component/prop-conduit transition and focused
tests, 30–60 minutes focused/E2E evidence, and remaining time for bounded senior/Copilot
review and substantive repair.
Failure to keep that estimate credible before coding requires a smaller re-cut, not scope
growth.

After a future exact docs-only merge: rerun AI OS check/preflight/resolver/scorecard; stop
for exact-hash runtime approval; register one active execution and prospective Brain
product session; use one writer and fresh worktree; run focused evidence first; use the
governed Z620 controller for heavy build/E2E; complete only one full E2E in CI on final PR
head; review Sonar/Copilot/threads early; merge only exact reviewed head; contain automatic
CD before effects; close tracker/Brain/milestone; verify exact clean main; delete exact
merged branch/worktree; rerun resolver/scorecard; and do not begin a second slice.

## Final checkpoint evidence

- Repo main and `origin/main` are exact at
  `3ffe2b52cc2044f78fb7c51425c87a9622042390`; tracked worktree and codex branch/worktree
  namespace are clean. Preflight passes with namespace report SHA-256
  `30f732ba86e9c359bc14d8eab2eeb4ea606b7048cf6cf414d8112d4584dea5e0`.
- Resolver remains `blocked_requires_current_authority / no_concrete_promoted_slice` from
  terminal `docs/plans/current-tracker.md`, with `activeSlice=null`. Scorecard is blocked
  only because no canonical slice/gate plan is active; branch readiness itself passes.
- AI OS observation
  `edee5818e031936aaf026d16c6bb4a4a574bb4685355c4826d3052f913d83c1d` reports
  Interdomestik authority current, active slice none, runtime not authorized and Brain
  current. Integrity is not clear: global published-state drift is blocking and vault
  session-integrity drift is advisory; unrelated NurseConnect/David diagnostics are also
  present. This candidate does not refresh or accept those advisory-system baselines.
  Repo authority remains final, and the drift must be cleared or classified before gate
  promotion/runtime under the stop conditions above.

## Review disposition

The bounded Claude Opus 5 read/grep-only review completed in 608.258 seconds with
`CONDITIONAL_PASS`. It confirmed that sequential owner-RLS read plus the privileged
canonical submitted writer truthfully avoids P0, six facts satisfy current validation,
the route/messages exist, and cross-scope reservation collisions fail closed. It required
six gate corrections: disclose resumed-audit writes; respect current line/import guards;
remove unconditional commercial-idempotency claims; disclose permanent pending state;
retain the outer 5/600 rate limit; and state that incident date is persisted through the
description rather than a claim column. It additionally noted current notification/E2E
residue and blank-tenant handling.

All findings were consolidated once. The material no-duplicate remediation added only a
server-derived deterministic claim id consumed by the existing domain submit seam and an
exact tenant/owner recovery read, changing the map from four/four to five/five without
schema, migration, generic-idempotency, claim-number or locale work.

The permitted focused Opus 5 re-review completed in 395.870 seconds with `NO_GO` against
that five-path map. It independently verified the primary-key backstop, narrow trusted-id
seam, P0 avoidance, mapper, audit/rate-limit/pending/date disclosures and cross-scope
failure. Its blocker was exact and mechanical: `main-panel.tsx` is the necessary prop
conduit because only `index.tsx` owns active draft/version/dirty state and claims-namespace
copy while only `dormant-preview.tsx` has room for the enabled control. It also required
the submit throw to be caught inside the authenticated handler, the non-RLS claim recovery
predicates to be explicit, line ceilings to reflect current files, the dormant boundary
test to be rewritten precisely and E2E membership/residue to be honest.

Those exact corrections are consolidated in this final six-production/five-test candidate.
No third reviewer round, candidate series or broader outcome is introduced. Exact-hash
human approval is therefore the next authority decision; implementation remains stopped.

## Approval semantics

Approval must quote this exact `document_id`, byte count and SHA-256. Approval authorizes
only docs-only canonical materialization of this design gate. It does not authorize
product code, runtime, branch/worktree creation, database/provider contact, deployment,
production mutation, P0 resumption or a second slice. After exact merge and resolver
selection, runtime still requires a separate exact-main receipt and exact-hash approval.
