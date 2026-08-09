# IDA-DG31 — IDA-UI03a2-B3 pre-submit availability truth

Status: consolidated candidate; not approved; not repository authority
Gate ID: `IDA-DG31`
Sole slice: `IDA-UI03a2-B3`
Base repository: `/Users/arbenlila/development/interdomestik-crystal-home`
Base branch: `main`
Base SHA: `56d30e30e01ceb980d528508b6376fc9c0a46a97`
Classification: product-facing copy/i18n implementation
Risk tier: Tier 2
Runtime authorized: false
Deployment authorized: false
Production mutation authorized: false

## Decision

Promote no implementation yet. After exact-file approval and a docs-only authority merge,
promote exactly one product micro-slice: `IDA-UI03a2-B3`.

The sole user outcome is:

> When saved-draft submission is unavailable, a member sees the real
> prerequisites for submission instead of the obsolete statement that claim safety checks
> are not ready.

The implementation is copy-only. It replaces exactly the existing localized
`claims.draftIntakeCopy.submitDisabled` and `submitExplanation` values in EN, SQ, MK and
SR and strengthens focused proof. It does not change the eligibility expression, React
component, server action, domain writer, route, selector, schema, RLS policy,
auth/session/tenant boundary, claim record, saved-draft record, idempotency record, event,
notification, provider or deployment behavior.

The current explanation predates completed canonical submit. It says submission will be
enabled only after claim safety checks are ready, while current source admits the normal
submit-capable route only with active membership and then enables submission when the
member has a valid persisted draft id/version, complete required facts and no unsaved
changes. An inactive member may still enter manager-only review/edit mode, where submit
must remain unavailable. The product now needs to describe those current prerequisites,
not a future technical milestone.

## Current-authority evidence

- `node tools/ai-os-state.mjs --check` passed on 2026-08-09 with observation
  `0d9babbb0800c5a65dbe0a2589f2466269a5f896fb28f0bd406a42ffa58d7ea2`:
  Brain `current`, Integrity `clear`, zero blocking contradictions, M1
  `verified_current`, M2/M3 `terminal`, M4/M5/M6 `no_qualified_candidate`, M7
  `no_authorized_enrollment`, and Atlas outside every cohort.
- Advisory Brain retrieval was current. It located the current tracker/program and B2
  authority but did not select or promote a successor. Repository authority remains final.
- Interdomestik is clean and synced on `main` at
  `56d30e30e01ceb980d528508b6376fc9c0a46a97`; only the canonical main worktree exists,
  the task branch namespace is clean, the B2 ledger is closed, the heavy-job controller is
  idle and no active execution exists.
- A no-power preapproval canary was attempted only through the governed heavy controller.
  The alias was unresolved and direct current LAN target timed out; the controller returned
  idle. Receipt `.tmp/ida-dg31-z620-preapproval-canary.txt` is 452 bytes / SHA-256
  `09b144550f3bffa5a6e327ede20a06da315d0b874388100283dff19cf64e7e80`.
  No wake was performed before design approval, so special-environment admission remains
  honestly pending rather than fabricated.
- Preflight and branch hygiene passed. Resolver and scorecard correctly return
  `blocked_requires_current_authority`, `activeSlice=null`, reason
  `umbrella_without_concrete_promoted_slice`. This gate is the required design selection;
  it is not runtime authority.
- `docs/plans/current-program.md` Rev 210 and `docs/plans/current-tracker.md` close B2,
  consume its runtime and leave handoff-context persistence and every next journey node
  separate and unpromoted.
- The merged B2 gate explicitly classified state-specific disabled reasons as a separate
  future micro-slice and excluded pre-submit disabled-state copy from B2.
- `apps/web/src/components/claims/claim-draft-intake/dormant-preview.tsx:31` is the current
  eligibility authority. Lines 83–94 render the disabled action when that expression is
  false; lines 127–130 expose `submitExplanation` as its accessible description.
- `apps/web/src/app/[locale]/(app)/member/claims/new/_core.entry.tsx:88-121` is the route
  admission authority: active membership admits normal intake, while the exact neutral
  `?mode=drafts` exception admits an inactive member only as `managerOnly=true`; every
  other inactive entry renders the membership gate.
- `apps/web/src/messages/{en,sq,mk,sr}/claims.json:6` still says that submission is waiting
  for future safety checks. That statement is contradicted by completed B1 behavior and
  the current eligibility source.
- `apps/web/e2e/smoke/ida-dashboard-smoke.spec.ts:130` hard-codes the old EN disabled label
  on the live inactive-member manager path and is therefore an exact value consumer that
  must be inside the test writer map.

## Candidate comparison

| Candidate | Immediate user value | Product paths | New contract/risk | Decision |
| --- | --- | ---: | --- | --- |
| Pre-submit availability truth | Replaces a false blocker with current submission prerequisites at the exact disabled action | 4 locale files | Existing behavior only; no runtime writer | Select |
| Persist handoff context after re-entry | Restores prior success/link context | New persisted/read ownership contract and wider proof | Independent capability | Defer |
| Add source badge or searchable origin link | Shows which claim came from a draft | New authoritative source-link/read-model semantics | Schema/read-model risk | Defer |
| Per-cause disabled-state branching | Names dirty, incomplete, unsaved and manager-only causes separately | Component/state contract plus extra locale keys | Larger second transition | Reject for this gate |
| Hero redesign | Broad public experience change | Cross-component visual surface | Separate phase | Exclude |
| Membership dashboard redesign | Broad authenticated IA change | Shared dashboard surface | Separate phase | Exclude |

This is the smallest current-repository-supported user-visible continuation. It removes a
known false statement without introducing a new state machine. A per-cause reason could be
more tailored, but it would require a component writer and new state-to-copy semantics.
The consolidated state-agnostic prerequisite statement names membership, saved-complete
state, unsaved-change state and the save/submit boundary. It truthfully covers both normal
and manager-only disabled cases while keeping the product writer map at four files.

## One user outcome

Any member who reaches saved-draft review while submission is disabled can identify four
current facts in one accessible explanation:

1. membership must be active;
2. the draft must be complete and saved;
3. no later edit may remain unsaved;
4. saving the draft does not submit the claim/request.

No second outcome is included. The slice does not make any new state eligible, add a link,
route the member out of manager mode, persist success state, display a claim-source badge or
change the canonical submit transition.

## Entry, transition and exit state

### Entry

- Host and route remain the existing neutral member Claim Draft Intake route.
- Actor is an authenticated member: either access-active in normal intake or inactive in
  the existing neutral-host manager-only exception.
- The existing preview is visible, but `eligible` is false because at least one current
  prerequisite is absent: active membership/normal mode, a valid saved draft id/version,
  complete required facts, or no unsaved edits.
- The existing disabled button and `aria-describedby` relationship are present.

### Single transition

- The component takes its existing `eligible === false` branch.
- No click, submit, route, write or side effect occurs.
- Existing locale loading supplies the replacement button label and explanation.
- The member reads or a screen reader announces the current availability truth.

### Exit

- The action remains disabled and inert.
- The button no longer implies that a future engineering safety check is the blocker.
- Its accessible description states active membership, completeness/save,
  no-unsaved-change and save-does-not-submit truth.
- Existing Save, Save changes, Manage, Resume, Back to details and eligible Submit behavior
  remain unchanged.

## Frozen copy contract

Only `claims.draftIntakeCopy.submitDisabled` and
`claims.draftIntakeCopy.submitExplanation` change. Exact proposed values:

- EN `submitDisabled`: `Submit claim — requirements not met`
- EN `submitExplanation`: `Submitting a claim requires active membership and a complete, saved draft with no unsaved changes. Saving the draft does not submit the claim.`
- SQ `submitDisabled`: `Dorëzo kërkesën — kushtet nuk janë plotësuar`
- SQ `submitExplanation`: `Për dorëzim duhen anëtarësim aktiv dhe një skicë e plotë e ruajtur, pa ndryshime të paruajtura. Ruajtja e skicës nuk e dorëzon kërkesën.`
- MK `submitDisabled`: `Поднеси барање — условите не се исполнети`
- MK `submitExplanation`: `За поднесување се потребни активно членство и целосен зачуван нацрт без незачувани измени. Зачувувањето на нацртот не го поднесува барањето.`
- SR `submitDisabled`: `Podnesi zahtev — uslovi nisu ispunjeni`
- SR `submitExplanation`: `Za podnošenje su potrebni aktivno članstvo i potpun sačuvan nacrt bez nesačuvanih izmena. Čuvanje nacrta ne podnosi zahtev.`

The disabled action retains each locale's current pre-submit claim/request noun and action:
Submit claim, Dorëzo kërkesën, Поднеси барање, Podnesi zahtev. This matches the adjacent
unchanged `draftIntakeCopy.truth`, which says the draft does not submit that claim/request
or assign a case. Once eligibility becomes true, the existing B1 action continues to use
the separately established submitted-case phrase from `claims.wizard.submit_label`; B3
does not alter that existing noun transition. Draft terms remain aligned with existing
locale draft copy.

The wording must not imply that:

- submission is disabled globally or until a future technical release;
- a complete but unsaved browser draft is sufficient;
- manager-only mode can submit;
- saving itself submits or creates a claim;
- the draft becomes the claim;
- submission decides coverage, liability, payment or recovery;
- an unavailable action is an error, denial or membership downgrade.

The exact explanation lengths are bounded at 142 EN, 136 SQ, 140 MK and 123 SR Unicode
characters. These values are frozen rather than granting a post-approval shortening
allowance. Their right-aligned mobile wrap requires bounded screenshot/manual inspection;
if any locale is unacceptable at 390px, STOP and re-gate instead of changing approved copy
or admitting a component writer.

## Eligibility truth matrix

| Existing source state | Existing runtime result | Frozen explanation remains truthful because |
| --- | --- | --- |
| inactive member with `managerOnly=true` | disabled | active membership is explicitly required; saving is not presented as submit |
| active member, no persisted draft id/version | disabled | a saved complete draft is required |
| active member, `hasUnsavedChanges=true` | disabled | no unsaved changes is required |
| active member, one required fact empty | disabled | completeness is required |
| active member, malformed draft id | disabled | current saved-draft contract is not satisfied; no unsupported recovery claim is made |
| active member, valid saved complete draft, no unsaved changes | enabled | disabled copy is absent; existing submit label and B1 transition remain unchanged |
| any member after `createdClaim` exists | success output | neither disabled nor enabled action renders; B2 truth and claim link remain unchanged |

This slice does not expose which predicate failed. If user research later shows that a
single prerequisite list is insufficient, a separately admitted state-specific component
slice may map predicates to messages. That future possibility cannot expand B3.

## Contract graph

### Nodes

- `N1 locale-source`: existing EN/SQ/MK/SR `claims.json`; sole product writer.
- `N2 translation-loader`: existing runtime `useTranslations('claims')` and
  `parseClaimDraftCopy`; read-only. Browser proof parses its already-imported raw locale
  JSON directly and must not import the React component module.
- `N3 admission-authority`: existing membership/manager-only route split; read-only.
- `N4 eligibility-authority`: existing `DormantPreview` Boolean expression; read-only.
- `N5 disabled-action`: existing disabled button and accessible description; read-only.
- `N6 enabled-submit`: existing B1 submit action; read-only and no-regression boundary.
- `N7 locale/component-test`: existing four-locale shape and mocked-DOM collector.
- `N8 active-member-browser-test`: existing `gate-ks-sq` saved-draft collector.
- `N9 inactive-manager-browser-test`: existing IDA dashboard smoke collector.
- `N10 baseline-copy`: exact four locale values on base SHA.

### Edges

- `E1 N1 -> N2`, operation `read two existing keys`.
- `E2 N3 -> N4`, operation `admit active normal or inactive manager-only mode`.
- `E3 N4 -> N5`, operation `select existing disabled branch`.
- `E4 N2 -> N5`, operation `render label and accessible description`.
- `E5 N4 -> N6`, operation `select existing eligible branch`; unchanged.
- `E6 N1 -> N7`, operation `prove exact four-locale values`.
- `E7 N5 -> N7`, operation `prove mocked disabled semantics, inertness and accessibility wiring`.
- `E8 N1 -> N8`, operation `bind real SQ locale source to active-member DOM description`.
- `E9 N6 -> N8`, operation `retain existing eligible submit and B1 source-draft proof`.
- `E10 N1 -> N9`, operation `bind real EN accessible name to inactive manager-only DOM`.
- `E11 N1 -> N10`, operation `compare replacement with exact baseline`.

### Closure

- Callers: the two keys enter runtime through `ClaimDraftIntake` -> `DormantPreview`; the
  exact label is additionally consumed by the declared IDA dashboard smoke selector.
- Shared consumers: no runtime consumer beyond this intake surface; both active and
  inactive browser collectors are declared.
- Read/write/delete: four locale values are the only product writes; no runtime store is
  read, written or deleted by the copy change.
- Mount/error paths: the existing false eligibility branch mounts the copy; success,
  failed and unexpected submission paths are unchanged.
- Capabilities: existing i18n loading and DOM semantics only; no browser storage, DB,
  provider or special runtime capability is added.
- Test collectors: the existing unit collector proves all locale values and mocked DOM
  wiring; `gate-ks-sq` binds real SQ copy to active-member DOM; IDA dashboard smoke binds
  real EN label to the inactive manager-only path.
- Baseline ownership: the exact base locale values own the zero-of-four
  truthful-current-fact baseline. Historical merged authority
  `docs/plans/2026-07-20-ida-dg20-ui03a3-claim-draft-intake-design-gate.json` retains the
  superseded wording as an immutable record and is not a runtime or test consumer.

## Frozen writer map

Exactly four product files:

1. `apps/web/src/messages/en/claims.json`
2. `apps/web/src/messages/sq/claims.json`
3. `apps/web/src/messages/mk/claims.json`
4. `apps/web/src/messages/sr/claims.json`

Exactly three focused test files:

5. `apps/web/src/components/claims/claim-draft-intake/claim-draft-intake.test.tsx`
6. `apps/web/e2e/gate/member-claim-draft-intake.spec.ts`
7. `apps/web/e2e/smoke/ida-dashboard-smoke.spec.ts`

One conditional deterministic metadata path is admitted only when the unchanged tracked
size synchronizer proves a changed value:

8. `scripts/repo-size-budget.json`

No production component is a writer. The existing test files are 148, 150 and 142 lines.
Their edits must replace or pack existing assertions and keep each at or below 150 lines.
For the 148-line unit file, replace its current four-line, one-locale, two-value
`toMatchObject` block with one `prettier-ignore` packed assertion that retains the exact EN
`heading` proof and adds all eight proposed locale values; update the existing mock literal
in place for fixture realism, not as production-copy proof, with no net line growth.
For the 150-line gate spec, parse the already imported raw source explicitly as
`JSON.parse(sq.claims.draftIntakeCopy) as Record<string, string>`, replace the existing
`aria-describedby` assertion with `toHaveAccessibleDescription`, and remove one blank
separator only. Importing `parseClaimDraftCopy` or any React component module into the
Playwright spec is STOP. No B1/B2 behavior assertion is removed or relaxed. The smoke spec
replaces only its one hard-coded old accessible-name value. No helper or new test file is
admitted.

Any required ninth writer path, component edit, new translation key or locale namespace
is scope expansion and triggers STOP before coding.

## Protected surfaces and exclusions

The following remain read-only and unchanged:

- `apps/web/src/proxy.ts`, canonical routes and clarity markers;
- `DormantPreview`, `ClaimDraftIntake`, save lifecycle and organizer state;
- canonical submit action, claim numbering/idempotency and owner/tenant checks;
- auth/session/OTP, roles, memberships, tenant resolution and RLS;
- schema, migrations, database rows, events, outbox, audit and notifications;
- billing/Paddle, provider integrations, deployment, aliases and production;
- CI/workflows, Playwright configuration and shared test infrastructure.

Read-only no-regression collectors `apps/web/e2e/ui-v2-onboarding.spec.ts` and
`apps/web/e2e/TEMPLATE.strict.spec.ts` continue to prove the literal `aria-describedby`
relationship while the frozen gate spec changes its matcher to the real localized
accessible description.
`apps/web/src/components/claims/claim-draft-intake/saved-draft-submit.test.tsx` remains a
read-only no-regression collector for dirty, not-persisted, malformed-id, incomplete and
manager-only disabled causes; its local fixture copy is intentionally generic and must not
be changed by B3.

Completed IDA-UI06a, IDA-UI06b, IDA-UI03b, IDA-UI03a2-P0a2a, B1, B2 and PR
#1514 remain closed absent regression evidence. Gemini maintenance remains stopped and no
Gemini files, versions or caches are in scope.

## UI/UX benchmark and measurable outcome

Observed 2026-08-09 from current official public sources:

- GEICO, `https://www.geico.com/claims/claimsprocess/online-claim-reporting/`: names a
  small initial information set, distinguishes additional helpful information and says
  reporting can continue without every optional detail.
- Allstate, `https://www.allstate.com/claims/auto-motorcycle`: states what may be needed,
  explicitly answers what happens when information is incomplete and says users can start
  with current details and add more later.
- State Farm, `https://www.statefarm.com/claims/auto/how-to-handle-an-accident`: separates
  preparation from filing and says the process may start immediately with later details.
- Authenticated operator disabled-action and confirmation screens were blocked because
  policy/claim credentials are required; none were accessed.

Comparison criteria:

1. Does copy distinguish current prerequisites from optional or later information?
2. Does copy identify a concrete next action without implying a technical release blocker?
3. Does the unavailable state preserve the difference between preparation and submission?

Better-than-baseline outcome:

- Metric: explicit current submission and preparation-boundary facts in the disabled-action description.
- Unit: truthful current-state facts.
- Direction: higher.
- Baseline: 0 of 4; current copy names only future safety-check readiness.
- Target: 4 of 4: active membership, complete saved draft, no unsaved changes, and saving
  does not submit.
- Method: deterministic four-locale exact-string contract plus one production-path SQ
  rendered accessibility assertion and one EN inactive-manager smoke assertion.

Anti-copy/trade-dress boundary: use only general progressive-disclosure and actionable
prerequisite principles. Do not copy operator wording, layout, branding, illustration,
motion or distinctive trade dress.

Arben approval is pending and must bind this exact gate/slice/hash before promotion. A
prospective benchmark packet cannot grant authority.

## TDD and acceptance tests

### RED first

Change the existing mock EN label/explanation and packed four-locale expectation in
`claim-draft-intake.test.tsx` to require all eight exact proposed production values. Run:

`pnpm --filter @interdomestik/web test:unit --run src/components/claims/claim-draft-intake/claim-draft-intake.test.tsx`

Expected RED: exact old production locale label/explanation mismatch. The mocked DOM
assertion proves only preserved accessibility wiring; real locale-to-DOM binding is owned
by the browser collectors. No locale file changes may precede this captured RED.

### GREEN focused proof

1. Same unit command passes with all four real locale values, existing manager-only and
   unsaved/inert assertions, and no skip.
2. `pnpm i18n:check && pnpm i18n:purity:check` passes with no key/shape drift.
3. Existing `gate-ks-sq` browser scenario, run once through the governed Z620 controller,
   proves the disabled action has the exact SQ accessible description before save, then
   retains the existing enabled-submit, canonical claim and source-draft re-entry proof.
4. Existing IDA dashboard smoke proves the inactive member still reaches manager-only
   review and sees the exact new EN disabled accessible name without gaining submit.
5. `pnpm check:e2e-contracts`, `pnpm check:modularity-guard`, repository-size and diff/security
   scope gates pass for the exact writer map.
6. Tier 2 current-head PR evidence passes `pnpm slice:verify`, `pnpm slice:e2e:pr` and
   `pnpm ci:local:pr` through the heavy controller where RAM-heavy.
7. Exactly one full E2E authority lane completes in CI on the final reviewed PR head.
   Skipped required proof is failure. A head change invalidates that lane; no other full
   rerun occurs without real invalidation.

### Acceptance criteria

- All eight frozen locale strings match exactly and preserve locale-owned nouns.
- Disabled action remains disabled, inert and outside a form.
- `aria-describedby` continues to resolve to the visible localized explanation.
- Exact SQ production translation renders as the active-member accessible description
  before save; exact EN production label renders on inactive manager-only resume.
- Saving a valid complete draft in normal mode still replaces the disabled action with the
  existing enabled submit action.
- Manager-only mode remains non-submitting; its existing resume/edit behavior is unchanged.
- B1 canonical submit, B2 success truth, claim link and retained-draft re-entry remain green.
- Diff contains only the seven frozen paths plus conditional deterministic size metadata.
- No new locale key, component, helper, selector or special proof environment appears.

## Highest-risk cases

1. A translation implies submission remains feature-disabled. Exact eight-string tests and
   locale review must reject future-tense release wording.
2. Generic copy omits the actual inactive-member blocker. Active membership is explicit in
   every locale and manager-only remains non-submitting.
3. Copy implies save performs submit. Preparation and submission remain separate clauses;
   existing inertness and B1 tests stay unchanged.
4. A locale drifts from its existing disabled claim/request phrase or draft nouns. Reviewer
   and exact locale contract must compare those existing sources; B1's enabled-case phrase
   remains an unchanged, separately established transition.
5. Longer copy becomes awkward in the existing right-aligned `max-w-sm` paragraph at 390px.
   The focused SQ browser lane proves visibility and accessibility but not typography;
   bounded reviewer/manual screenshot inspection is required and any unacceptable wrap
   triggers STOP because component layout is outside scope.
6. Test modification weakens B1/B2 proof to fit line ceilings. Existing canonical claim,
   success, link and retained-draft assertions may not be deleted, skipped or relaxed.
7. An implementation attempt introduces per-cause branching. That is a second behavior
   contract and requires a fresh consolidated gate, not an addendum.

## Review and feedback routes

- Before recommendation: one bounded Opus 5 adversarial design review when available;
  no repeated request merely to extend its timer. A terminal quota failure may use the
  policy fallback, recorded exactly.
- Product PR: one bounded senior exact-diff review covering product/copy, accessibility,
  maintainability, security/tenancy non-impact and tests.
- GitHub Copilot is requested only through the PR surface. Assignment failure, no output or
  findings are recorded and classified; no local Copilot loop is invented.
- Sonar, CodeQL, security and review threads are inspected early and fail closed. Review is
  repeated only after substantive remediation.
- No secrets, PII, claim narratives, member messages or private credentials enter any
  reviewer packet.

### Bounded design-review disposition

- Opus 5 initial adversarial review completed in 363.979 seconds and returned REVISE. It
  found that manager-only implies inactive membership and that the IDA dashboard smoke was
  an omitted exact-label consumer. Both were remediated in this same consolidated scope.
- Opus 5 post-remediation review completed in 395.047 seconds and returned REVISE. It
  confirmed those blockers closed, then rejected future-tense membership wording for the
  already-active audience. Copy was converted to present-tense requirements and shortened.
- Opus 5 final exact-current review completed in 369.359 seconds with no blocker. Its three
  required hardenings were applied without changing product scope or frozen strings:
  retain the existing heading assertion, bind Playwright directly to raw SQ JSON without a
  React-module import, and classify the five-cause component test as read-only.
- No further design-review round is required. Models remain advisory and grant no
  repository or runtime authority.

## Rollback and publication compatibility

Before runtime, discard the ignored candidate or revert only its future docs-only authority
merge. During implementation, revert the exact four locale and three test paths on the
dedicated branch. After merge, rollback is a single revert of the product merge; no schema,
data, claim, draft, provider or deployment rollback is required.

Compatibility is additive at the semantic level and shape-preserving at runtime: the two
existing string keys remain strings, all callers and selectors remain unchanged, and no
migration/backfill is needed. Old clients receive old bundled copy; newly built clients
receive the corrected copy. No mixed-version data contract exists.

Publication sequence:

1. Arben approves this exact candidate by identifier, UTF-8 byte count and SHA-256.
2. Through the governed controller, wake Z620 only after this design approval and rerun the
   cheap hostname/Docker/disk canary. The admission receipt must return `ready`; otherwise
   stop without creating an authority branch.
3. Create one task-owned docs-only authority branch/worktree from then-current clean main.
4. Publish the byte-identical gate plus minimal current-program/current-tracker promotion,
   run Tier 0 authority proof, bounded feedback and merge exact reviewed authority head.
5. Use only the governed publication path; never direct `ai-os-refresh` and never fabricate
   a milestone.
6. Rerun AI OS check, preflight, resolver and scorecard. AI OS and resolver must agree on
   `activeSlice=IDA-UI03a2-B3`, `runtimeAuthorization=not_authorized`.
7. Prepare one exact-main runtime receipt binding gate, admission, UI/UX receipt, task,
   writer map, evidence lanes and exclusions; stop here for exact approval.
8. Only after exact runtime approval register active execution, initialize a new durable
   B3 ledger, open the policy-required Brain product session and create one product
   branch/worktree.
9. Implement RED then GREEN within the frozen map. Run focused evidence first and heavy
   work only through the governed Z620 controller.
10. Open and review one product PR. Merge only exact reviewed current head with CI, Sonar,
   CodeQL, security, Copilot/feedback and finalizer green or explicitly classified.
11. Contain automatic CD before provider/deploy effects; no deploy or production mutation.
12. Merge one closeout PR, publish the milestone through the governed path, close Brain
    session/ledger, clear active execution, ensure heavy-job idle, remove only B3 refs and
    verify exact clean/synced main and terminal resolver. Do not start a second slice.

## Stop conditions

Stop and return for one fresh consolidated gate if any of the following is discovered:

- a component, action, route, schema, auth, tenancy, billing, provider, CI/workflow or
  deployment file must change;
- a new translation key, helper, selector, test file or ninth writer path is required;
- state-agnostic prerequisites are not truthful for an existing mounted disabled state;
- product need becomes per-cause branching, automatic navigation, handoff persistence,
  source linking, claim mutation or draft-to-claim synchronization;
- a locale cannot preserve the four facts without legal/product clarification;
- any existing test file must grow above 150 lines or existing B1/B2 proof must weaken;
- copy clips, overlaps, hides the explanation or breaks keyboard/screen-reader semantics;
- exact-head focused proof, i18n, scope, reviewer, Sonar, security or required CI evidence
  is not green or explicitly resolved;
- Z620 is not connected/listening for required heavy evidence;
- final PR head changes after the sole completed full E2E authority lane;
- a second product outcome or special proof environment appears;
- PR-ready throughput is no longer credible within 2–4 active hours.

## Non-goals

- No Hero redesign, public-header work or membership-dashboard redesign.
- No anonymous, inactive-member or active-member entry-tree expansion.
- No handoff-context, success-state or claim-link persistence after re-entry.
- No saved-draft badge, source field, origin link, search or list projection.
- No per-cause disabled-state UI, dynamic hints, new link or automatic navigation.
- No claim/draft lifecycle, edit/delete, eligibility, submit or idempotency change.
- No personal injury, documents/uploads, German, AI, billing, provider or deployment.
- No README, AGENTS, architecture cleanup, CI work or technical prerequisite slice.
- No Gemini maintenance, deletion or model/configuration change.

## Residual risks

- One generic prerequisite explanation is less tailored than a per-cause message. This is
  accepted to keep one truthful copy-only outcome; later evidence may justify a separate
  component slice.
- A malformed persisted id is represented by the generic saved-draft requirement rather
  than an error diagnosis. The state is not expected from the authoritative lifecycle;
  recovery behavior is outside B3.
- Public benchmarks cannot inspect authenticated disabled controls, so they support only
  progressive-disclosure and actionable-prerequisite principles, not visual imitation.
- Locale quality remains subject to Arben's exact-hash approval and bounded reviewer
  disposition; no model grants repository authority.

## Admission summary

- Product outcomes: 1.
- Product writer paths: 4.
- Test writer paths: 3.
- Conditional metadata paths: 1.
- Independently invalidatable proof surfaces: 3: four-locale/mock-wiring contract, one
  combined real-locale browser surface covering SQ active and EN inactive paths, and
  exact-head repository/CI gates.
- Shared runtime consumers beyond entry: 0.
- Special proof environments: 1, governed Z620 for focused browser/parity evidence.
- Contract graph closure, highest risks, rollback, acceptance matrix and stop conditions are
  complete. The admission shape is complete, but its environment canary is intentionally
  `pending_sleeping_runner` before human design approval; no `ready` claim is made.
- Runtime, deployment and production remain unauthorized.

## Approval boundary

This artifact grants no authority by existing. Approval must name exactly:

`IDA-DG31-UI03a2-B3-PRE-SUBMIT-AVAILABILITY-TRUTH`, its exact UTF-8 byte count and exact
SHA-256.

After approval, only the docs-only authority-publication sequence may begin. Product coding
still waits for merged gate authority, fresh AI OS/resolver agreement and a separately
approved exact-main runtime receipt.
