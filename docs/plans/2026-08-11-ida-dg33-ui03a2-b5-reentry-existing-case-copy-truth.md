---
title: IDA-DG33 UI03a2-B5 Re-entry Existing Case Copy Truth
date: 2026-08-11
status: prospective_exact_hash_candidate
authority: advisory_until_exact_approval_review_and_merged_repo_promotion
runtime_authorized: false
promoted_slice: IDA-UI03a2-B5
risk_tier: 2
base_sha: 1d3c04c339a3f50483b313da5a71d35288b0c737
owner: product + localization + accessibility + qa
---

# IDA-DG33 — UI03a2-B5 re-entry existing-case copy truth

## Decision boundary

This is one prospective current-authority/design-gate candidate for exactly one
user-visible product slice:

`IDA-UI03a2-B5 — when a verified member re-enters a retained saved draft and the
already-merged B4 lookup restores its canonical submitted case, present existence-state
copy that is truthful on re-entry and remains truthful immediately after a deliberate
submit.`

The candidate is not repository authority and grants no runtime authority. Exact Arben
approval of this UTF-8 artifact, a structurally passing UI/UX approval receipt, a passing
admission receipt, focused Tier-0 authority evidence, one authority PR merge, governed
publication, exact AI OS/resolver agreement and a separately approved exact runtime
receipt are all required before product mutation.

The design-gate mutation is Tier 0. The prospective product slice is Tier 2 because it
changes product-facing copy/i18n on an existing member workflow. It changes no behavior,
component state machine, action, writer, claim lookup, auth, tenancy, route, schema, RLS,
billing, provider, deployment or production contract.

## Verified starting state

- `main == origin/main == 1d3c04c339a3f50483b313da5a71d35288b0c737`; the canonical
  repo is clean and only the canonical main worktree exists.
- Skill preflight passes, branch/worktree namespace hygiene passes with report
  `0d318ba89be3d1eafd0edfab633bcd2a4728c18c16e051c1af03f449de5b2214`,
  and convergence passes.
- Canonical resolver returns `blocked_requires_current_authority`, reason
  `umbrella_without_concrete_promoted_slice`, `activeSlice=null`, from the final marker
  in `docs/plans/current-tracker.md`. Workflow scorecard blocks only because no concrete
  active slice has been promoted.
- Governed generation `bb75267166029d173bf4f386d4bdd1c12f69dc71c0d94f3f2733e708aa2e03c5`
  and AI OS observation
  `70f7e21a185cdcf4a9f819d525feceeb6c92e05ebb9b26529ecb573825d1bbf1`
  prove Brain current, Integrity clear and zero blocking contradictions. M1 is
  `verified_current`; M2/M3 are terminal; M4-M6 report `no_qualified_candidate`; M7
  reports `no_authorized_enrollment`; Atlas has zero cohort membership.
- A single focused Brain query was current and returned `current-tracker` and
  `current-program` as its first two locators. It supplied no promotion and remains
  advisory.
- B1-B4, UI03a4, UI03a5 and UI03a6 are terminal. No completed slice is reopened.
- B4 explicitly records that its reused past-tense `submit_success` sentence is less
  explicit on background re-entry and that any later copy improvement is a separate
  slice. B4 also keeps generic source provenance, `origin_ref_id`, badges and list-wide
  projections outside its authority.

## Why this is the smallest valuable continuation

B4 closes the behavioral gap: a retained draft that already produced a canonical claim
restores the existing claim link without another Submit activation. Its found state reuses
the B2 sentence beginning `Case submitted`. That sentence is accurate, but on a fresh
re-entry it describes a past submission event without explicitly telling the user that
the current saved draft already has a submitted case. A user can therefore need to infer
whether the message describes this current state or only the prior browser session.

The smallest correction is to make the one shared message state-based rather than
session-event-based. The same message remains truthful immediately after the deliberate
B1 submit, so no component branching, new locale key or second presentation state is
needed. Four existing locale values change and all runtime code remains untouched.

Rejected alternatives:

1. Add separate `submitted_now` and `existing_case` locale keys selected by B4 origin.
   Rejected because it adds a component contract and at least a fifth product path for a
   distinction that one state-based sentence can express truthfully.
2. Persist generic `origin`/`origin_ref_id` and render a source badge. Rejected because it
   changes schema/shared-writer/provenance contracts and is materially larger than this
   copy seam.
3. Redesign the saved-draft list or membership dashboard. Rejected as a separate phase
   and a second surface.
4. Change only English. Rejected because the active EN/SQ/MK/SR contract must remain
   semantically aligned.
5. Reopen B2, B3 or B4 behavior. Rejected because there is no regression evidence and
   their state, action and persistence contracts are already complete.

## One user outcome

Primary user: a verified member who re-enters one retained saved Free Start draft for
which the existing B4 owner/tenant lookup finds the canonical submitted case.

Outcome: before the canonical case link, the user reads a state-based sentence that says
there is already a submitted case for this saved draft, that it is dashboard-trackable,
and that later draft edits do not change the case. The user does not need to infer that
truth from wording describing a prior submission event.

Numeric better-than-baseline target:

- Metric: active locales whose exact restored-state sentence explicitly states both
  existing submitted-case presence for the saved draft and later-edit independence.
- Unit: locale contracts.
- Direction: higher.
- Baseline: `0/4` active locales contain the explicit existing-state cue.
- Target: `4/4` active locales contain both required truths.
- Measurement: deterministic locale contract assertion plus immediate-submit and re-entry
  component assertions; one focused browser collector checks SQ after submit and re-entry.

## Entry, transition and exit state

### Entry

- Existing canonical member intake route, saved-draft manager and B4 lookup are unchanged.
- A syntactically valid retained draft id has been resumed.
- The verified owner/tenant B4 lookup has returned the existing canonical claim, or the
  existing B1 deliberate submit has just returned success.
- The component receives the existing `wizard.submit_success` string; no new key,
  parameter or user-provided value is introduced.

### Transition

- No runtime transition changes. B4 `background_lookup` and B1 `user_submit` continue to
  reach the same existing success output through their current tested state machine.
- The four existing `claims.wizard.submit_success` values become state-based and avoid
  claiming that submission occurred in the current mount/session.
- Copy must not claim durable generic source linkage, automatic synchronization, draft
  locking, claim mutation, new dashboard behavior or that the draft is itself the case.

### Exit

- Re-entry found: the existing output states that a submitted case already exists for the
  saved draft, preserves the canonical case link and does not render Submit.
- Immediate successful submit: the same sentence is truthful, the existing success focus
  behavior remains, and the canonical case link remains unchanged.
- Lookup absent/error and submit failure states are byte-for-byte unchanged.
- No route navigation, focus, aria-live role, selector, state, action, event, audit,
  notification, cache or persistence behavior changes.

## Frozen product copy contract

The exact proposed locale values are:

- EN: `There is already a submitted case for this saved draft. You can track it from the dashboard. Later edits to the saved draft do not change the case.`
- SQ: `Për këtë skicë të ruajtur ekziston tashmë një rast i dërguar. Mund ta ndiqni nga paneli. Ndryshimet e mëvonshme në skicën e ruajtur nuk e ndryshojnë rastin.`
- MK: `За овој зачуван нацрт веќе постои поднесен случај. Можете да го следите од контролната табла. Подоцнежните измени на зачуваниот нацрт не го менуваат случајот.`
- SR: `Za ovaj sačuvani nacrt već postoji podnet slučaj. Možete ga pratiti sa kontrolne table. Kasnije izmene sačuvanog nacrta ne menjaju slučaj.`

These strings describe only existence and separation already proved by B1-B4. “For this
saved draft” is a product-state statement bounded to the deterministic same-owner B4
lookup; it does not promote a generic searchable origin relation or cross-consumer source
contract.

## Exact writer map

Product paths — exactly four, frozen:

1. `MOD apps/web/src/messages/en/claims.json`
2. `MOD apps/web/src/messages/sq/claims.json`
3. `MOD apps/web/src/messages/mk/claims.json`
4. `MOD apps/web/src/messages/sr/claims.json`

Only the existing `claims.wizard.submit_success` value may change in each file. Key order,
JSON structure and every other value remain byte-for-byte unchanged.

Focused test/spec paths — exactly four, frozen:

1. `MOD apps/web/src/components/claims/claim-draft-intake/claim-draft-intake.test.tsx`
   - pins exact EN/SQ/MK/SR values and both truth clauses.
2. `MOD apps/web/src/components/claims/claim-draft-intake/saved-draft-submit.test.tsx`
   - updates the fixture and proves immediate-submit success/focus/link semantics.
3. `MOD apps/web/src/components/claims/claim-draft-intake/saved-draft-reentry.test.tsx`
   - asserts the state-based sentence on background restoration, no submit and no focus
     theft.
4. `MOD apps/web/e2e/gate/member-claim-draft-intake.spec.ts`
   - proves the SQ sentence after deliberate submit and after retained-draft re-entry,
     with the canonical link and no repeated Submit action.

Conditional deterministic metadata path, not product behavior:

- `scripts/repo-size-budget.json` only if staged-tree inventory requires canonical sync.

No TypeScript/TSX production file, action, hook, schema, migration, route, proxy, auth,
tenancy, claim writer, draft writer, dashboard or provider file is authorized. A fifth
product path or fifth test/spec path stops the slice.

## Contract graph

Nodes:

- `N1` retained saved-draft member intake entry.
- `N2` existing B4 owner/tenant background lookup and origin state.
- `N3` existing B1 deliberate submit success state.
- `N4` shared `claims.wizard.submit_success` locale value in EN/SQ/MK/SR.
- `N5` existing success output and canonical claim link.
- `N6` locale/component focused tests.
- `N7` one existing member claim-draft browser collector.

Edges:

- `N1 -> N2`: re-entry invokes the unchanged B4 lookup.
- `N2 -> N5`: found background state renders existing success output without focus theft.
- `N3 -> N5`: deliberate submit renders the same output with existing focus behavior.
- `N4 -> N5`: the sole changed input is the localized state-based sentence.
- `N6 -> N4/N5`: exact locale and component proof covers both origins.
- `N7 -> N1/N2/N3/N4/N5`: one browser collector covers SQ submit and re-entry.

Closure:

- Callers: the existing intake translation call is the only runtime consumer in scope.
- Shared consumers: no new shared consumer is added.
- Read/write/delete: four static locale value writes at implementation time; zero runtime
  store writes/deletes and zero action/lookup changes.
- Mount/error paths: immediate success, background found, not-found/error fallback and
  failure remain covered; only success text changes.
- Capability requirements: no provider, private data fixture or special proof environment.
  Governed Z620 is an execution resource checked after runtime approval, not an admission
  capability and not a reason to wake the host during design.
- Test collectors: three unit/component collectors and one browser spec.
- Baseline ownership: B1 owns submit, B2 owns separation truth, B3 owns availability truth,
  B4 owns re-entry lookup; B5 owns only the shared state-based success sentence.

## Acceptance matrix

Skipped required cases are failures.

1. Exact EN copy equals the frozen string and contains submitted-case existence,
   dashboard tracking and later-edit independence.
2. Exact SQ/MK/SR copy equals each frozen translation and carries the same three truths;
   no active locale falls back to English.
3. Background re-entry renders the updated sentence, canonical claim link and no Submit;
   success output does not receive focus.
4. Deliberate submit renders the same sentence and canonical link while preserving the
   existing success-focus behavior and exactly-once submit proof.
5. Not-found/error, disabled/ineligible and submit-failure paths retain their current copy
   and behavior.
6. The sentence does not claim that the draft and case are the same record, that edits
   synchronize, or that a generic source relation is persisted.
7. `pnpm i18n:check` and `pnpm i18n:purity:check` pass.
8. Focused unit/component collectors pass before browser work.
9. One governed focused browser collector proves SQ immediate-submit and re-entry truth.
10. Tier-2 current-head verification, repo-native security, exact-head PR gates, Sonar,
    CodeQL, Copilot disposition, feedback intake and finalizer satisfy repo policy.
11. Exactly one full final-PR-head CI E2E authority lane completes; rerun occurs only after
    a head change or a real defect invalidates it.

Planned focused commands after runtime approval:

- `pnpm --filter @interdomestik/web test:unit --run src/components/claims/claim-draft-intake/claim-draft-intake.test.tsx src/components/claims/claim-draft-intake/saved-draft-submit.test.tsx src/components/claims/claim-draft-intake/saved-draft-reentry.test.tsx`
- `pnpm i18n:check`
- `pnpm i18n:purity:check`
- Existing focused member claim-draft browser command derived by the governed gate plan.
- Tier-2 `pnpm slice:verify`, followed through the heavy-job controller by the exact
  mandatory `pnpm pr:verify`, `pnpm security:guard` and `pnpm e2e:gate` commands plus one
  supporting PR-parity lane only where the canonical gate plan requires it. No second
  local full-E2E authority lane is added.

## Highest-risk cases

1. The shared sentence is truthful on re-entry but sounds false immediately after submit.
   Mitigation: use existence-state wording valid at both moments and prove both origins.
2. A translation implies the saved draft itself was submitted or that later edits change
   the case. Mitigation: exact frozen four-locale contract and locale-level review.
3. The copy implies a generic persisted source relation broader than B4's deterministic
   same-owner lookup. Mitigation: avoid “linked”, “source”, synchronization or provenance
   language and retain the B4 boundary explicitly.
4. Test-only edits accidentally weaken B1/B4 action or focus assertions. Mitigation: only
   update text fixtures/assertions; existing invocation, link, no-submit and focus checks
   remain mandatory.
5. Browser proof is duplicated or rerun despite an unchanged head. Mitigation: one focused
   browser collector and one full exact-head CI E2E lane, with invalidated-only reruns.

## UI/UX benchmark

Observed 2026-08-11T05:37:00.000Z from public official pages:

1. Office for National Statistics Service Manual —
   `https://service-manual.ons.gov.uk/design-system/patterns`: separates “Save and sign
   out” from a confirmation page, supporting explicit draft-continuation versus submitted
   state.
2. State Farm “Check Existing Claim” —
   `https://www.statefarm.com/claims/check-existing-claim`: distinguishes an already-filed
   claim and its tracking action from beginning a new claim.
3. Allstate “File or Track a Claim” —
   `https://www.allstate.com/claims/file-track`: presents filing and tracking as distinct
   user intents and directs an existing claim to management rather than filing again.

Blocked sources: none used. Authenticated operator claim interiors were not accessed and
are not required for this bounded copy principle.

Comparison criteria:

- Does the surface distinguish an existing submitted record from starting/submitting a
  new one?
- Does the copy name the next tracking action without implying that the editable draft and
  submitted record are the same state?
- Is wording valid both immediately after submit and after later re-entry?

Anti-copy/trade-dress boundary: use only the general principles of explicit state and
separate track/file actions. Do not copy operator wording, layout, branding, illustration,
interaction styling or distinctive trade dress.

## Verification and reviewer disposition

Prospective design review is bounded and internal only, per current user authority; no
external model or reviewer is called. The senior review checks one question set:

- Is this a real user-visible outcome rather than docs/CI/infrastructure work?
- Is one state-based shared sentence truthful for both `background_lookup` and
  `user_submit`?
- Does the four-file map avoid reopening B1-B4 behavior and all protected surfaces?
- Do acceptance and rollback cover every changed product byte and consumer?
- Is the 2-4 active-hour PR-ready target credible?

Disposition required before recommendation: `accept` only if all five answers are yes;
otherwise revise once into this same consolidated candidate or reject it. External
reviewer unavailability is not represented as pass. GitHub Copilot is requested only on
the future PR; it is not a design authority.

## Admission shape

- Product outcomes: 1.
- Product writer paths: 4.
- Test/spec writer paths: 4.
- Conditional metadata paths: 1.
- Independently invalidatable proof surfaces: 3 — exact locale contract;
  submit/re-entry component semantics; focused browser plus exact-head gates.
- Shared runtime consumers beyond the existing entry: 0.
- Special proof environments: 0 — no nonstandard capability is required. Z620 remains the
  governed heavy execution resource and must be connected/listening before its first
  post-approval heavy job, but no pre-approval wake/canary is warranted.
- Contract graph closure: complete.
- First implementation action: RED exact-copy assertions in locale contract and re-entry
  component test before changing locale JSON.
- Throughput: expected PR-ready active time 1-3 hours; if a new key, component change,
  translation provider, fifth product path or new contract is needed, stop and re-cut.

The immutable admission JSON is generated only after this candidate's exact bytes/SHA-256
are known. A structural `ready` result does not promote authority and does not authorize
runtime.

## Rollback

Rollback is one revert of the future four-locale product commit/PR. The existing B2/B4
sentence returns without data migration, backfill or runtime cleanup. No persisted user
state, case, draft, event or audit row is transformed. If locale or component proof shows
semantic asymmetry before merge, do not merge; restore only the four proposed values and
their matching test fixtures.

Rollback triggers:

- any active locale fails the three-truth contract;
- immediate-submit or background re-entry semantics become contradictory;
- the wording implies generic provenance or draft/case synchronization;
- accessibility/focus/link behavior changes despite zero code authority;
- any protected or non-frozen product path is required.

## Non-goals and exclusions

- No new locale key, German locale or copy outside the four exact values.
- No component, hook, action, deterministic identity, lookup or submit change.
- No draft create/update/delete/resume semantic change.
- No claim writer/read, generic origin, `origin_ref_id`, source badge, reverse lookup or
  list-wide projection.
- No saved-draft list, membership dashboard, claim detail/tracking or Hero redesign.
- No route, `proxy.ts`, auth/session/OTP, tenancy, schema, migration, RLS, billing/Paddle,
  provider, deployment, production, CI/workflow or AI OS code.
- No reopening B1, B2, B3, B4, UI03a4, UI03a5, UI03a6, UI06a, UI06b, UI03b or P0a2a
  without regression evidence.
- No external model review, model maintenance, Gemini deletion/maintenance, Atlas cohort,
  KG/Papers/MatrAIx work or `log.md` mutation.
- No second slice or automatic successor promotion.

## Stop conditions

Stop and return for fresh authority if:

- any fifth product path, fifth test/spec path, new locale key, production TS/TSX file or
  protected surface is required;
- one shared sentence cannot remain semantically correct for both immediate submit and
  background re-entry;
- translation review identifies a material ambiguity that requires UI branching;
- a generic source/provenance contract, schema field, writer or additional consumer is
  needed;
- focused proof requires weakening an existing invocation, focus, no-submit, owner/tenant
  or canonical-link assertion;
- AI OS is not Brain current/Integrity clear/zero-blocking/M1-M7 verified, or AI OS and
  resolver disagree after promotion;
- exact gate approval, UI/UX receipt, admission receipt, exact runtime approval,
  current-head review/Copilot/Sonar/CodeQL/security/finalizer or sole full-E2E evidence
  cannot be proved;
- PR-ready work is no longer credible within four active hours;
- a second outcome or second product slice appears.

## Residual risks

- State-based copy is intentionally less celebratory immediately after a new submission;
  clarity across re-entry is preferred over session-specific celebration in this shared
  message.
- Human translation quality is bounded by exact task approval and repository review; no
  external translation provider is authorized.
- The sentence describes the deterministic same-owner relation in user language but does
  not create a generic persisted provenance relation.
- Authenticated operator interiors were not benchmarked; public official pages support
  only the state-separation principle, not visual equivalence.

## Exact approval boundary

This artifact grants no authority by existing. Promotion requires Arben to approve the
exact artifact ID, UTF-8 byte count and SHA-256. After that approval only, the owner may
finalize the UI/UX approval receipt and immutable admission receipt, create one fresh
docs-only authority branch/worktree from then-current clean synced main, run focused Tier-0
evidence, open/review/merge one authority PR, publish through the governed milestone path,
and verify the resolver selects only `IDA-UI03a2-B5` with
`runtimeAuthorization=not_authorized`.

Only then may an exact runtime receipt be generated. Product branch/worktree/code/E2E and
runtime mutation remain prohibited until Arben separately approves that runtime receipt.
