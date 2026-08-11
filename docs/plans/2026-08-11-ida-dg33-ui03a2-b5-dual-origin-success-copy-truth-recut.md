---
title: IDA-DG33 UI03a2-B5 Dual-Origin Success Copy Truth Consolidated Recut
date: 2026-08-11
status: prospective_exact_hash_candidate
authority: advisory_until_exact_approval_review_and_merged_repo_promotion
runtime_authorized: false
promoted_slice: IDA-UI03a2-B5
risk_tier: 2
base_sha: d4248799dab8f2fafaa229808e5303695e24103e
supersedes: IDA-DG33-UI03a2-B5-REENTRY-EXISTING-CASE-COPY-TRUTH
owner: product + localization + accessibility + qa
---

# IDA-DG33 — UI03a2-B5 dual-origin success-copy truth consolidated recut

## Decision boundary

This is one consolidated recut of the already-promoted `IDA-UI03a2-B5` slice. It
replaces the prior shared-copy design after exact PR review evidence proved that one
sentence cannot remain semantically correct for both success origins.

The sole product outcome is:

`A verified member receives truthful localized success copy for the transition that
actually occurred: a fresh successful submit says that the case was submitted now,
while retained-draft re-entry says that a submitted case already exists.`

The design-gate mutation is Tier 0. The prospective product remediation remains Tier 2
because it changes product-facing copy/i18n and one existing presentation component. It
does not change persistence, lookup, submit, auth, tenancy, routing, schema, RLS, billing,
provider, deployment, notification, audit or claim/draft lifecycle semantics.

This candidate grants no authority by existing. Product runtime remains
`not_authorized` until Arben exact-approves this artifact and the paired conditional
runtime receipt, the gate is merged through one authority PR, governed publication
passes, AI OS/resolver agreement is re-proved and every activation condition in the
runtime receipt is satisfied.

No R3/addendum loop is authorized. If this consolidated contract proves insufficient,
stop and split future work rather than extending B5 again.

## Verified starting state

- Canonical repository: `/Users/arbenlila/development/interdomestik-crystal-home`.
- `main == origin/main == d4248799dab8f2fafaa229808e5303695e24103e`; main is clean.
- Prerequisite repair PR `#1531` is merged at that exact SHA. Its task-owned governed
  publication event is
  `c465656fbdee73bb4db78be13b361e477eeff7c88163f889370c80fc4674bdad`.
- AI OS observation
  `bf4aece85cbad6d4d1a299a469bec2a74d711d3be67a7f317b6a8bb477ea7dd5`
  proves Brain `current`, Integrity `clear`, zero blocking contradictions and fresh
  publication at `2026-08-11T09:23:15.502Z`.
- M1 is `verified_current`; M2 and M3 are `terminal`; M4-M6 are
  `no_qualified_candidate`; M7 is `no_authorized_enrollment`. Atlas remains outside all
  real-work cohorts/enrollments.
- AI OS and the canonical resolver agree: `activeSlice=IDA-UI03a2-B5`,
  `runtimeAuthorization=not_authorized`.
- The current product worktree is clean on `codex/ida-ui03a2-b5`, exact PR head
  `a7a0930e60f731d78baeafdef4d5be34b7c62c3c`, one commit above current main. Product PR
  `#1532` remains open and unmerged.
- The merged prerequisite branch/worktree was verified clean and merged, then removed;
  its already-absent remote ref was pruned. The only task-owned product branch/worktree
  remaining is the active B5 continuation.
- `log.md`, concurrent AI OS control-store work and Atlas isolation work remain
  user-owned and outside this writer map.
- No product code, product test, build or E2E mutation occurred while preparing this
  recut.

## Regression evidence and root cause

Automatic Codex review on PR `#1532`, current head `a7a0930e...`, opened unresolved
discussion `#discussion_r3756416898` at 2026-08-11T08:35:47Z:

`Separate fresh-submit copy from re-entry copy.`

The finding is valid:

1. `use-saved-draft-claim.ts` already records the success origin as
   `background_lookup` when the B4 lookup restores an existing claim and `user_submit`
   when the member's click creates the claim.
2. `dormant-preview.tsx` already consumes `origin` for focus behavior but renders
   `submitCopy.success` for both origins.
3. The current PR changes `claims.wizard.submit_success` to begin with “There is already
   ...” in every locale, so a newly successful submit immediately claims that the case
   already existed.
4. The changed unit and E2E assertions encode that misleading fresh-submit behavior.

This activates an explicit stop condition of the prior gate: one shared sentence cannot
remain correct for both deliberate submit and re-entry. The smallest correction is to
branch presentation copy on the existing origin discriminant. No new state transition,
lookup, action, persistence relation or origin field is required.

## One user outcome

Primary user: a verified active member using the existing saved Free Start draft intake.

Outcome metric:

- Metric: success origins that display transition-accurate localized copy.
- Unit: origin states across four active locales.
- Direction: higher.
- Baseline: `1/2` origins are semantically correct on current PR head; re-entry is
  explicit, fresh submit is misleading.
- Target: `2/2` origins are correct in `4/4` active locales.
- Method: exact locale contract plus component tests for both origins and one SQ browser
  collector that proves submit then re-entry without another Submit action.

## Entry, transition and exit state

### Entry

The entry route, member session, active-membership eligibility, retained draft identity,
B4 owner/tenant lookup and B1 submit action are unchanged. The component receives:

- `claim` from the existing hook;
- `origin` as `user_submit`, `background_lookup` or `null` from the existing hook;
- fresh-submit copy through existing `submitCopy.success`;
- re-entry copy through one new required localized field in existing
  `claims.draftIntakeCopy`.

### Transition

No state transition changes.

- `origin === 'user_submit'`: render existing `submitCopy.success` and preserve current
  success focus.
- `origin === 'background_lookup'`: render `copy.existingCaseSuccess` and preserve no
  focus theft.
- A claim cannot be intentionally rendered with a third success origin under the current
  hook contract. The presentation defaults only to the fresh-submit sentence for an
  impossible/null origin; tests keep the two reachable origins exhaustive.

The exact rendering expression is semantically equivalent to:

`origin === 'background_lookup' ? copy.existingCaseSuccess : submitCopy.success`

No hook/action or public type is widened. No source/provenance claim is persisted.

### Exit

- Fresh submit: the output says the case was submitted, names dashboard tracking and
  states that the saved draft remains separate; canonical link, claim number,
  exactly-once submit and focus behavior remain unchanged.
- Background re-entry: the output says a submitted case already exists for this saved
  draft, names dashboard tracking and states that later draft edits do not change the
  case; canonical link and no-submit/no-focus-theft behavior remain unchanged.
- Lookup not-found/error and submit failure remain unchanged.

## Frozen localized copy contract

### Existing fresh-submit copy — restore/retain in `claims.wizard.submit_success`

- EN: `Case submitted. You can track it from the dashboard. Your saved draft stays separate; later edits to the draft do not change this case.`
- SQ: `Rasti u dërgua. Mund ta ndiqni nga paneli. Skica juaj e ruajtur mbetet e veçantë; ndryshimet e mëvonshme në skicë nuk e ndryshojnë këtë rast.`
- MK: `Случајот е поднесен. Можете да го следите од контролната табла. Зачуваниот нацрт останува одделен; подоцнежните измени во нацртот не го менуваат овој случај.`
- SR: `Slučaj je podnet. Možete ga pratiti sa kontrolne table. Sačuvani nacrt ostaje odvojen; kasnije izmene nacrta ne menjaju ovaj slučaj.`

### New re-entry field — add as `existingCaseSuccess` inside serialized
`claims.draftIntakeCopy`

- EN: `There is already a submitted case for this saved draft. You can track it from the dashboard. Later edits to the saved draft do not change the case.`
- SQ: `Për këtë skicë të ruajtur ekziston tashmë një rast i dërguar. Mund ta ndiqni nga paneli. Ndryshimet e mëvonshme në skicën e ruajtur nuk e ndryshojnë rastin.`
- MK: `За овој зачуван нацрт веќе постои поднесен случај. Можете да го следите од контролната табла. Подоцнежните измени на зачуваниот нацрт не го менуваат случајот.`
- SR: `Za ovaj sačuvani nacrt već postoji podnet slučaj. Možete ga pratiti sa kontrolne table. Kasnije izmene sačuvanog nacrta ne menjaju slučaj.`

The new field is part of the existing required `ClaimDraftCopy` payload. It is not a new
next-intl namespace/key and requires no `index.tsx` writer. Missing/malformed serialized
copy continues to fail closed through the existing parse/render contract; no fallback to
English or to ambiguous wording is introduced.

## Exact writer map

Product paths — exactly five, frozen:

1. `MOD apps/web/src/components/claims/claim-draft-intake/dormant-preview.tsx`
   - add `existingCaseSuccess: string` to existing `ClaimDraftCopy`;
   - select only the displayed success sentence from the existing `origin` value.
2. `MOD apps/web/src/messages/en/claims.json`
3. `MOD apps/web/src/messages/sq/claims.json`
4. `MOD apps/web/src/messages/mk/claims.json`
5. `MOD apps/web/src/messages/sr/claims.json`
   - restore/retain only the frozen fresh `wizard.submit_success` value;
   - add only the frozen `existingCaseSuccess` property to `draftIntakeCopy`.

Focused existing test/spec paths — exactly four, frozen:

6. `MOD apps/web/src/components/claims/claim-draft-intake/claim-draft-intake.test.tsx`
7. `MOD apps/web/src/components/claims/claim-draft-intake/saved-draft-submit.test.tsx`
8. `MOD apps/web/src/components/claims/claim-draft-intake/saved-draft-reentry.test.tsx`
9. `MOD apps/web/e2e/gate/member-claim-draft-intake.spec.ts`

Conditional deterministic metadata path:

10. `scripts/repo-size-budget.json`, only if the canonical synchronizer proves drift.

No `index.tsx`, `use-saved-draft-claim.ts`, action, route, proxy, schema, migration,
database, auth, tenancy, dashboard, workflow/CI or new test file is authorized. A sixth
product path, fifth test/spec path or second metadata path stops execution.

## Modularity and implementation limits

- `dormant-preview.tsx` is 135 lines on current PR head and must remain at or below 150.
- `claim-draft-intake.test.tsx` is 147 lines and must not grow.
- `saved-draft-submit.test.tsx` is 149 lines and must not grow.
- `saved-draft-reentry.test.tsx` is 136 lines and may remain below 150.
- `member-claim-draft-intake.spec.ts` is 149 lines and must not grow.
- Use existing prettier-ignore compact fixtures where needed; do not weaken assertions or
  bypass `check:modularity-guard`.

## Contract graph

Nodes:

- `N1` member saved-draft preview entry.
- `N2` existing hook origin `user_submit`.
- `N3` existing hook origin `background_lookup`.
- `N4` localized fresh `wizard.submit_success` store.
- `N5` localized `draftIntakeCopy.existingCaseSuccess` store.
- `N6` `DormantPreview` display selector and canonical success output.
- `N7` focused locale/component collectors.
- `N8` existing member SQ browser collector.
- `N9` B1-B4 behavioral baseline.

Edges:

- `N1 -> N2`: deliberate submit succeeds through unchanged action/hook.
- `N1 -> N3`: retained-draft lookup finds the unchanged canonical claim.
- `N2 + N4 -> N6`: fresh-submit output and current focus behavior.
- `N3 + N5 -> N6`: existing-case output without focus theft.
- `N7 -> N2/N3/N4/N5/N6`: exact dual-origin and four-locale proof.
- `N8 -> N1/N2/N3/N4/N5/N6`: one browser flow submits then re-enters.
- `N6 -> N9`: link, number, action, focus, eligibility and separation behavior compare
  against unchanged B1-B4 baseline.

Closure:

- Callers: `DormantPreview` is the sole display consumer changed; `index.tsx` already
  supplies both existing copy payloads and does not change.
- Shared consumers: zero new consumers beyond the existing intake entry.
- Read/write/delete: four static locale files and one presentation selection change;
  zero runtime persistence writes/deletes change.
- Mount/error paths: user-submit, background-found, lookup not-found/error and submit
  failure are already represented by focused tests.
- Capability: no provider/private fixture/special product environment is added. Z620 is
  only the governed heavy execution resource after runtime activation.
- Test collectors: three existing unit/component files and one existing E2E spec cover
  every changed product byte and reachable origin.
- Baseline ownership: B1 owns submit, B2 owns draft/case separation, B3 owns availability,
  B4 owns canonical re-entry lookup; B5 owns only origin-accurate success presentation.

## Acceptance tests

Skipped required cases fail.

1. EN/SQ/MK/SR fresh-submit strings equal the frozen values.
2. EN/SQ/MK/SR `existingCaseSuccess` strings equal the frozen values and are non-empty.
3. `user_submit` renders fresh-submit copy, canonical link and claim number, receives the
   existing success focus and preserves exactly-once submit.
4. `background_lookup` renders existing-case copy, canonical link and claim number,
   renders no Submit and does not steal focus.
5. The fresh and existing-case strings are explicitly unequal in every active locale.
6. Lookup not-found/error, disabled/ineligible and submit-failure behavior/copy remain
   unchanged.
7. No active locale falls back to English; `pnpm i18n:check` and
   `pnpm i18n:purity:check` pass.
8. `pnpm check:modularity-guard` passes with no touched-file growth beyond frozen limits.
9. The focused SQ browser flow first sees fresh-submit copy, then after re-entry sees
   existing-case copy with the same claim number/link and zero repeated Submit.
10. Focused unit/i18n/modularity evidence runs before any heavy lane.
11. One exact-head PR evidence sequence covers required Phase C gates, security, Sonar,
    CodeQL, Copilot, feedback intake and finalizer.
12. Exactly one full final-PR-head CI E2E authority lane completes. Rerun only after head
    change or a real defect invalidates it.

Planned focused proof:

- `pnpm --filter @interdomestik/web test:unit --run src/components/claims/claim-draft-intake/claim-draft-intake.test.tsx src/components/claims/claim-draft-intake/saved-draft-submit.test.tsx src/components/claims/claim-draft-intake/saved-draft-reentry.test.tsx`
- `pnpm i18n:check`
- `pnpm i18n:purity:check`
- `pnpm check:modularity-guard`
- the existing focused `gate-ks-sq` member claim-draft collector through the governed
  heavy-job controller only after focused proof.

## Highest-risk cases

1. Copy selection is reversed, leaving either fresh submit or re-entry misleading.
2. `origin=null` or lookup error accidentally displays existing-case copy.
3. A locale restores fresh copy but omits/mistranslates existing-case copy.
4. The new required serialized field is missing from a fixture and is hidden by a loose
   cast or fallback.
5. Test edits weaken exactly-once submit, canonical link/number, no-submit or focus proof.
6. The 149-line tests/spec grow past the governed modularity boundary.
7. Old-head CI/E2E evidence is reused after the remediation commit.

## Frontend, accessibility and operations

- Server/client boundary is unchanged; `DormantPreview` remains an existing client-side
  consumer.
- State ownership remains in `useSavedDraftClaim`; no state is moved or duplicated.
- Semantic `<output>`, test IDs, claim-number attribute, link accessible name, keyboard
  activation, focus-on-user-submit and no-focus-on-background behavior remain unchanged.
- Responsive classes and layout are untouched.
- No new log, metric, trace, audit event, alert, support control or admin diagnostic is
  required because runtime behavior and failure modes do not change.
- Performance/cost impact is one in-memory string selection with no request, render-loop,
  provider or storage cost.

## UI/UX benchmark continuity

The 2026-08-11 contemporaneous benchmark remains applicable to this exact seam:

1. ONS Service Manual patterns: explicit saved-progress and completion-state separation.
2. State Farm “Check Existing Claim”: existing-claim management is distinct from filing.
3. Allstate “File or Track a Claim”: filing and tracking are distinct intents.

Comparison criteria are transition accuracy, clear track-versus-submit intent and
draft/case state separation. The recut improves the prior design by preserving both
transition-specific messages instead of forcing one compromise sentence.

Anti-copy/trade-dress boundary: only state-separation principles are used. No operator
wording, layout, branding, illustration, styling or distinctive trade dress is copied.
Exact approval of this recut supplies the required contemporaneous UI/UX approval receipt;
the prior gate approval cannot be silently reused as approval of these bytes.

## Reviewer disposition

No external model/reviewer was invoked because current authority forbids external model
calls without a new explicit authorization.

Bounded internal senior review disposition: `accept_candidate_for_exact_human_approval`.

Evidence:

- The current PR finding is concrete, current-head and reproducible from existing code.
- The recut uses an already-existing discriminant rather than adding lifecycle state.
- One production TSX file plus four locale stores is the minimum truthful repair.
- The new field is required and locale-bound; no English fallback is introduced.
- Writer map, tests, rollback and stop conditions cover the complete changed contract.
- PR-ready remediation remains credible within 1-2 active hours after activation.

The unresolved PR thread remains a blocker until the exact remediation is pushed,
reviewed and the thread is resolved. Automatic Codex review is evidence of the defect,
not promotion authority. GitHub Copilot remains required on the remediated PR head.

## Admission shape

- Product outcomes: 1.
- Product writer paths: 5.
- Existing test/spec writer paths: 4.
- Conditional metadata paths: 1.
- Independently invalidatable proof surfaces: 3 — locale contract; dual-origin component
  presentation; browser/exact-head PR evidence.
- Shared runtime consumers beyond the existing entry: 0.
- Special proof environments: 0.
- Contract graph closure: complete.
- First implementation action: RED assertions proving distinct fresh-submit and
  background-re-entry strings before production mutation.

The immutable admission receipt is generated from this exact artifact SHA and must return
`ready`. It does not grant repository or runtime authority.

## Rollout and rollback

Rollout is the normal reviewed product PR `#1532` on one exact head. No feature flag,
staged provider rollout, migration or production mutation is needed. Automatic CD must be
contained before provider/deploy effects.

Rollback is one revert of the future B5 product merge. It restores the prior presentation
and locale payloads; there is no data migration, backfill, user-state cleanup, provider
action or compatibility window.

Rollback triggers:

- either origin displays the wrong sentence;
- any locale is missing/asymmetric;
- focus, link, claim number, Submit visibility or exactly-once behavior changes;
- any protected/non-frozen path is required;
- required exact-head evidence remains red, stale or unresolved.

## Non-goals and exclusions

- No `index.tsx`, hook, action, lookup, submit, claim/draft writer or state-machine change.
- No generic source/origin persistence, `origin_ref_id`, badge, reverse lookup or list
  projection.
- No new next-intl namespace/key, German locale or copy outside the frozen fields.
- No saved-draft list, claim dashboard/detail, membership dashboard or Hero redesign.
- No route, `proxy.ts`, auth/session/OTP, tenancy, schema, migration, RLS, billing/Paddle,
  provider, webhook, notification, deployment or production mutation.
- No CI/workflow/gate/shard/worker configuration change.
- No AI OS/KG/Papers/MatrAIx code, Atlas cohort/enrollment, `log.md`, Gemini maintenance
  or deletion.
- No external model call under this approval.
- No reopening B1-B4 or any other completed slice beyond this regression-scoped B5
  remediation.
- No second slice or successor promotion.

## Stop conditions

Stop for fresh authority if:

- exact gate/runtime hashes are not approved;
- authority merge/publication/check activation conditions drift;
- `index.tsx`, hook/action, another production file, new test file or protected surface is
  needed;
- a new persistence/state/provenance/route/auth/tenancy/schema contract appears;
- any frozen test assertion must be weakened;
- the new field cannot remain required in all four locale payloads;
- a second addendum or R3 would be needed;
- current-head reviewer/Copilot/Sonar/CodeQL/security/finalizer evidence cannot be
  obtained or honestly classified;
- Z620 cannot be proved connected/listening before required heavy work;
- PR-ready remediation is no longer credible within two active hours;
- a second product outcome appears.

## Exact approval and activation boundary

This artifact must be approved by exact ID, externally measured UTF-8 byte count and
SHA-256 together with the paired conditional runtime receipt. That approval authorizes:

1. one docs-only authority amendment PR that replaces the prior B5 gate with this exact
   consolidated recut and updates only canonical B5 authority markers required by policy;
2. focused Tier-0 authority evidence, review, merge and governed publication;
3. activation of the paired runtime receipt only if the merged gate remains byte-identical,
   AI OS is green, resolver/AI OS still agree on B5/not-authorized, admission is ready and
   branch/worktree bindings remain exact.

Until every condition is proved, product runtime remains unauthorized. Once they are
proved, the exact-approved runtime receipt may activate without a third approval prompt.
Any mismatch stops before product mutation.
