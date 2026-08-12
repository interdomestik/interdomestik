# IDA-DG34 — UI03a2-B6 unsaved-changes Submit truth

Status: consolidated candidate; not approved; not repository authority; runtime unauthorized.

## Decision and authority boundary

This gate proposes exactly one future product slice:
`IDA-UI03a2-B6-UNSAVED-CHANGES-SUBMIT-TRUTH`.

One user outcome only: an access-active member with a valid, complete, securely saved
vehicle/property draft who edits it before submission receives a localized disabled-Submit
explanation that says to save those changes first and that saving does not submit the
claim/request.

This external task-owned candidate authorizes no repository branch, product worktree,
Brain product session, active execution, E2E, runtime mutation, deployment or production
effect. Arben must approve the final exact identifier, UTF-8 byte count and SHA-256 before
the byte-identical gate can enter a docs-only authority PR. Gate approval is not runtime
approval. Product coding requires a later exact-main runtime receipt and a separate exact
approval.

## Verified starting state

Observed 2026-08-12:

- Interdomestik `main == origin/main ==`
  `ac386b2adfd2090a1dbc34b898ea58263e6ae5e6`; main and worktree namespace are clean.
- Canonical preflight passes. Heavy-job controller is idle/completed. Active execution is
  absent. No Z620 work or E2E was consumed for discovery.
- Canonical resolver returns `blocked_requires_current_authority`,
  `umbrella_without_concrete_promoted_slice`, `activeSlice=null`.
- Workflow scorecard blocks only on the intentionally absent active slice/gate.
- AI OS observation
  `4aa028902b0345d59ae3e535372e14be94bef772756d7e1978b88531516a06cf`
  proves Brain=current, Integrity=clear, zero blocking contradictions, M1-M7 verified,
  Interdomestik `activeSlice=none`, runtime `not_authorized`.
- Session integrity is clear.
- One bounded Brain current-authority query completed in 792 ms (1.72 seconds process
  wall), returned about 462 context tokens backed by about 25,753 indexed source-span
  tokens, and correctly located B5/current-program authority without inventing a
  successor. It did not select this candidate. Recovery query/search count: 0.
- Repo AGENTS, current-program, current-tracker, architecture tracker, source and tests are
  final authority; Brain was advisory orientation only.

No tracked repository file changed during discovery or candidate review preparation.

## Repository-supported selection

Current-program/current-tracker Rev 217 consume B5 and require fresh selection before any
successor. Earlier canonical authority explicitly leaves state-specific disabled
branching, handoff-context persistence, source/origin linkage, Hero redesign, membership
dashboard work and further journey transitions separate and unpromoted.

B3 explicitly deferred per-cause disabled-state behavior as a future micro-slice. Current
source exposes a bounded first branch:

- `DormantPreview` already receives `hasUnsavedChanges`, saved id/version, manager mode,
  complete draft facts and localized claim copy.
- Its eligibility expression already requires normal mode, valid saved identity/version,
  complete facts and no unsaved changes.
- Its disabled Submit explanation is currently generic for five causes.
- The dirty state is uniquely safe to specialize for Submit truth only when every
  non-dirty Submit prerequisite is already true. This avoids inventing a precedence among
  simultaneous Submit causes; the separate secure-save lifecycle may still own a
  conflict, limit, account-context, loading or saving recovery state.

Fresh tracker evidence rejects reopening `IDA-UI03a6`, `IDA-UI06a`, `IDA-UI06b`,
`IDA-UI03b`, `IDA-UI03a2-P0a2a`, B1-B5 or PR #1514 absent regression. `IDA-UI03a6` in
particular completed through authority PR #1483 and product PR #1484.

### Candidate comparison

| Candidate | User value | Product writers | Trust/state expansion | Decision |
| --- | --- | ---: | --- | --- |
| Dirty-only Submit truth | Gives an exact immediate prerequisite in the one state where it is sole blocker | component + 4 locales | none | Select |
| All disabled causes | Tailors manager, identity, completeness and dirty states | broader state/copy matrix | cause precedence | Defer |
| Handoff persistence | Restores source context after re-entry | persistence/ownership | yes | Defer |
| Source/origin badge | Exposes draft-to-claim provenance | read-model/schema | yes | Defer |
| Hero redesign | Broad anonymous experience | cross-component | separate phase | Exclude |
| Membership dashboard | Broad authenticated IA | shared dashboard | separate phase | Exclude |

The selected slice does not reserve a successor or claim completion of the whole
disabled-state or journey tree.

## Risk tier

**Tier 2 — localized UI/accessibility behavior, no protected runtime writer.**

The visible and accessible explanation changes conditionally, so copy parity,
accessibility semantics and exact branch proof are required. No route, proxy, auth,
tenancy, schema, RLS, billing, claim/draft writer, provider, deployment or production
surface changes. Any need to touch those surfaces escalates and stops this gate.

## One user outcome

For the exact dirty-only Submit state, the disabled Submit action explains:

1. save the current changes before submitting; and
2. saving those changes does not submit the claim/request.

No eligibility, save, submit, navigation, persistence or claim truth changes. This is a
prerequisite statement, not a promise that the save control is currently available. The
existing Secure Save band separately owns save/recovery availability.

## Entry, transition and exit

### Entry

- Canonical neutral member Claim Draft Intake route.
- Authenticated, access-active member in normal intake; `managerOnly=false`.
- Valid saved draft id and truthy saved version under the existing predicate, unchanged.
- Vehicle/property draft has all currently required facts.
- No existing submitted claim has been found.
- The current draft fingerprint differs from the last saved fingerprint;
  `hasUnsavedChanges=true`. The existing fingerprint covers category, five facts and
  resume step, so advancing from a saved details step to preview also qualifies even when
  no fact text changed.
- Every non-dirty Submit eligibility prerequisite is true. Therefore unsaved changes are
  the sole reason the existing Submit action is disabled.
- The Secure Save band is mounted on the neutral front door. Its own lifecycle state may
  expose Save changes or may temporarily withhold it while its existing conflict, limit,
  account-context, loading or saving status owns recovery. This gate does not change or
  promise that control's availability.

### Single transition

- Derive `readyExceptUnsavedChanges` with an explicit `Boolean(...)` around the exact
  existing non-dirty eligibility terms: normal mode, valid saved id, truthy saved version
  and complete required facts.
- Preserve eligibility as `readyExceptUnsavedChanges && !hasUnsavedChanges`.
- Only when `readyExceptUnsavedChanges && hasUnsavedChanges`, select the new locale-owned
  `submitUnsavedExplanation` value through a ternary at the existing paragraph; never use
  a raw numeric/nullish conjunction in rendered JSX.
- All other disabled causes retain the current generic `submitExplanation` value.
- Rendering only: no click, write, read, lookup, route, focus or lifecycle transition.

### Exit

- Submit remains disabled, inert, outside a form and linked to one visible explanation by
  the existing `aria-describedby` relationship.
- The member sees/hears the dedicated unsaved-change truth in their current locale.
- The existing Save changes action remains the only save writer.
- After that unchanged action succeeds, the existing lifecycle may clear dirty state and
  existing eligibility may expose Submit; this slice does not alter that behavior.

## Frozen localized copy contract

Add exactly one string field, `submitUnsavedExplanation`, inside the existing serialized
`claims.draftIntakeCopy` object in each existing locale file:

- EN: `Save your changes before submitting. Saving changes does not submit the claim.`
- SQ: `Ruajini ndryshimet para dorëzimit. Ruajtja e ndryshimeve nuk e dorëzon kërkesën.`
- MK: `Зачувајте ги измените пред поднесување. Зачувувањето на измените не го поднесува барањето.`
- SR: `Sačuvajte izmene pre podnošenja. Čuvanje izmena ne podnosi zahtev.`

The field is a complete locale-owned sentence pair, not composition of standalone button
labels. No fallback, namespace crossing, interpolation or English literal is allowed.
`submitExplanation`, `submitDisabled`, fresh-submit success and existing-case success
remain byte-for-byte unchanged.

The dedicated value is selected only when unsaved changes are the sole blocker. If locale
review finds any sentence inaccurate or unnatural, STOP and return to this gate; do not
patch translation during implementation.

## Exact writer map

Exactly five product files:

1. `apps/web/src/components/claims/claim-draft-intake/dormant-preview.tsx`
2. `apps/web/src/messages/en/claims.json`
3. `apps/web/src/messages/sq/claims.json`
4. `apps/web/src/messages/mk/claims.json`
5. `apps/web/src/messages/sr/claims.json`

Exactly two focused test files:

6. `apps/web/src/components/claims/claim-draft-intake/saved-draft-submit.test.tsx`
7. `apps/web/src/components/claims/claim-draft-intake/claim-draft-intake.test.tsx`

Exactly one fixture-only type-closure writer:

8. `apps/web/src/components/claims/claim-draft-intake/saved-draft-reentry.test.tsx`

This file adds only the required `submitUnsavedExplanation` fixture field. It owns no new
assertion or proof surface and remains <=150 lines (current 139, expected 140).

One conditional deterministic metadata path is admitted only if the unchanged size
synchronizer proves a changed tracked value:

9. `scripts/repo-size-budget.json`

No other path may be written. `dormant-preview.tsx` is 137 lines and must remain <=150.
Both focused proof tests are exactly 150 lines and may only replace/pack assertions with no
net line growth and no weakened case. The fixture-only test may grow from 139 to at most
140 lines. A helper, new test file, E2E edit or tenth writer path is scope expansion and
STOP.

## Contract graph

### Nodes

- `N1 mode`: existing `managerOnly` prop.
- `N2 saved-identity`: existing saved id/version props.
- `N3 facts`: existing five required draft facts.
- `N4 dirty`: existing `hasUnsavedChanges` prop from draft lifecycle.
- `N5 ready-except-dirty`: new presentation derivation from N1-N3 only.
- `N6 eligibility`: existing behavior, represented equivalently as N5 and not N4.
- `N7 generic-copy`: existing `submitExplanation` in four claims locales.
- `N8 dirty-copy`: new `submitUnsavedExplanation` in the same four locale objects.
- `N9 disabled-action`: existing button and described-by paragraph.
- `N10 save-action`: existing Secure Save band writer, read-only.
- `N11 unit-branch-collector`: existing `saved-draft-submit.test.tsx`.
- `N12 locale-collector`: existing `claim-draft-intake.test.tsx`.
- `N13 reentry-fixture`: existing required `ClaimDraftCopy` object literal; fixture-only.
- `N14 browser-collectors`: existing claim-draft/full CI E2E, read-only.
- `N15 runtime-writers`: existing draft/claim actions, forbidden.

### Edges

- `E1 N1,N2,N3 -> N5`: derive all non-dirty prerequisites.
- `E2 N5,N4 -> N6`: preserve exact eligibility truth.
- `E3 N5,N4,N8 -> N9`: dirty-only description selection.
- `E4 N7 -> N9`: all other disabled causes retain generic copy.
- `E5 N4 -> N10`: unchanged lifecycle exposes existing Save changes writer.
- `E6 N6,N9 -> N11`: prove five disabled controls plus eligible behavior.
- `E7 N7,N8 -> N12`: prove exact four-locale shape and values.
- `E8 N8 -> N13`: keep the strict copy fixture type-complete; no new assertion.
- `E9 N9,N10 -> N14`: existing integration collectors remain green.
- `E10 N6 -/-> N15`: no new write/read/delete/capability edge.

### Closure

- Callers: `ClaimDraftMainPanel` is the sole `DormantPreview` caller and already passes all
  required signals; no prop or caller change.
- Shared consumers: the serialized copy is consumed only by Claim Draft Intake; existing
  tests are declared collectors.
- Read/write/delete: component reads current props and locale copy only; no runtime store,
  browser data, draft, claim, event or provider state changes.
- Mount/error paths: dirty-only false eligibility selects N8; manager-only, invalid,
  not-persisted and incomplete controls select N7; lookup, pending, success and failure
  paths remain unchanged.
- Capability requirements: React and existing next-intl loading only; no special browser,
  DB or provider capability.
- Test collectors: N11 owns branch truth/inertness; N12 owns exact serialized locale
  values; N13 is fixture closure only; N14 provides unchanged exact-head integration.
- Baseline ownership: B3 owns N7; each claims locale owns N8; this slice owns only the
  N5/N4 presentation selection.

## Protected surfaces and exclusions

Read-only and unchanged:

- `apps/web/src/proxy.ts`, routes and clarity markers;
- `ClaimDraftIntake`, `ClaimDraftMainPanel`, Secure Save band and lifecycle hooks;
- saved-draft/claim actions, deterministic claim identity, idempotency and lookup;
- auth/session/OTP, memberships, role, owner and tenant boundaries;
- schema, migrations, RLS, database, events, notifications, audit and outbox;
- billing/Paddle, providers, workflows, runner configuration, deployment and production;
- completed B1-B5 and all other completed IDA slices.

No AI OS, Brain, retrieval, KG, Atlas, persona, model, dashboard or agent-count change.
Gemini maintenance stays stopped. User-owned `log.md` and unrelated state stay untouched.

## UI/UX benchmark

Observed 2026-08-12 from current official public sources:

- GEICO — `https://www.geico.com/claims/claimsprocess/online-claim-reporting/`:
  separates a small required start set from optional later details.
- Allstate — `https://www.allstate.com/claims/auto-motorcycle`: explicitly tells a user
  with incomplete information to start with current details and add more later, then
  separates filing from later tracking/addition.
- State Farm — `https://www.statefarm.com/claims/auto/how-to-handle-an-accident`:
  identifies a concrete transition from preparation to filing while allowing later detail.
- Authenticated dirty-draft Submit screens were not accessed because customer claim
  credentials are out of scope; this is recorded as one blocked source class.

Comparison criteria:

1. Does the blocked state name the immediate prerequisite rather than imply a technical or
   future-release blocker?
2. Does it preserve preparation/save versus submission?
3. Does it avoid promising eligibility beyond the exact current state?

Better-than-baseline:

- Metric: explicit dirty-state facts in the disabled Submit description.
- Unit: truthful facts.
- Direction: higher.
- Baseline: 1 of 2 (generic text says no unsaved changes but not the direct next action).
- Target: 2 of 2 (save current changes first; saving changes does not submit).
- Method: exact four-locale values plus deterministic dirty-only/control unit assertions.

Anti-copy/trade-dress boundary: use only principles of actionable next-step guidance and
save/submit separation. Copy no operator wording, layout, branding, illustration, motion
or distinctive trade dress.

Arben approval is pending. The UI/UX receipt must later bind this exact gate/slice/approval
and pass `ui-ux-governance-check.mjs` before promotion.

## TDD and acceptance matrix

### RED first

In `saved-draft-submit.test.tsx`, add the field to the existing fixture and strengthen the
existing six-cause table without net line growth:

- dirty with every other prerequisite true expects the dedicated description;
- not persisted, valid id with missing version, malformed id, incomplete and manager-only
  expect generic description;
- every Submit remains disabled/inert and the submit writer remains uncalled.

Exact packing move: add `// prettier-ignore` immediately before the existing `const copy`
declaration and pack that whole object using the established `claimCopy` repository
precedent; add the required fixture field there; extend every existing row and the new
valid-id/missing-version row with its expected description; accept that value in the
existing test callback; and add one accessible-description assertion. Packing the fixture
frees the line budget required by the sixth row and assertion under Prettier. Do not add a
helper, remove a cause row, rely on a non-Prettier-stable packed property line or weaken any
existing assertion.

In `saved-draft-reentry.test.tsx`, add only the required fixture field to its existing copy
literal. It is type-closure evidence, not RED ownership.

Focused command:

`pnpm --filter @interdomestik/web test:unit --run src/components/claims/claim-draft-intake/saved-draft-submit.test.tsx`

Expected RED: dirty receives the generic description rather than the dedicated value.

### GREEN

1. The same focused test passes the dirty case plus five non-dirty controls, eligible submit, at-most-one click,
   success, focus, keyboard, failure and retry behavior without skip or weakened assertion.
2. `claim-draft-intake.test.tsx` packed exact-value assertion proves all four dedicated
   values while retaining every existing B3/B5 exact value and mounted behavior. This
   assertion—not generic i18n tooling—owns serialized-object key presence.
3. `pnpm i18n:check` and `pnpm i18n:purity:check` pass for outer message parity/purity;
   they are supporting evidence and do not claim to parse serialized `draftIntakeCopy`.
4. Modularity guard proves component/test files <=150 lines.
5. Repository-size, exact writer-map diff and `pnpm security:guard` pass.
6. Tier-2 current-head gates required by repository policy run through the governed heavy
   controller where RAM-heavy.
7. Exactly one full exact-head CI E2E authority lane completes on the final reviewed PR
   head. Existing claim-draft gate behavior stays green. No rerun unless a head change or
   real defect invalidates evidence.

### Acceptance criteria

- Dirty-only state is derived only when all non-dirty eligibility prerequisites are true.
- Dirty-only Submit remains disabled/inert and has the exact current-locale dedicated
  accessible description.
- Five other disabled controls—including valid id with missing version—retain the generic
  description byte-for-byte.
- Secure Save band behavior and availability remain unchanged; this copy is a prerequisite
  statement and does not promise that Save changes is currently mounted.
- Saving may restore existing eligibility; eligibility behavior is semantically unchanged.
- No fresh-submit/existing-case copy, claim link or source-draft truth changes.
- Four locale objects remain shape-identical; no fallback/interpolation.
- No route, auth, tenancy, persistence, claim or draft writer changes.
- No new selector, helper, test file or browser spec.
- Exact final head has required senior/Copilot disposition, Sonar, CodeQL, security,
  feedback, finalizer and the one full E2E lane before merge.

## Highest-risk cases

1. **Cause precedence:** dedicated copy must appear only when every non-dirty prerequisite
   is true. If any simultaneous-cause priority is needed, STOP and re-gate the broader
   matrix.
2. **Semantic eligibility drift:** N5/N4 must be logically equivalent to the current
   expression. The dirty case, five isolated non-dirty controls (including valid id with
   missing version) and eligible case are mandatory truth-table proof.
3. **Locale correctness:** the four frozen sentences require exact approval and reviewer
   inspection. Any correction after approval invalidates the gate hash.
4. **Accessibility:** retain one visible paragraph, the existing id and described-by
   relationship; no hidden-only copy, live region or focus change.
5. **Save-action availability:** `conflict`, `limit`, `accountContext`, `loading` and
   `saving` can coexist with unsaved fingerprint drift while the band withholds Save
   changes. The dedicated sentence remains prerequisite truth; the band's existing status
   owns recovery. Any request to change that availability is a separate slice and STOP.
6. **Line ceilings:** both tests are 150 lines. Pack/replace only; never delete or weaken
   prior B1-B5 evidence to make room.
7. **Scope creep:** no generic cause resolver, helper, caller change, E2E edit or protected
   surface.
8. **Evidence inflation:** focused proof first; one exact-head full CI E2E only.

## Reviewer and Value Mode plan

- One bounded Opus 5 design-review sequence. The initial 100,719 ms route could inspect repository source but
  could not read an external `/tmp` candidate; it correctly raised three mandatory design
  concerns: unproven Save-action co-mount, ambiguous cause precedence and fragile
  cross-namespace label composition. The readable exact-candidate review then found
  writer-map fixture closure, save-control availability, SQ register, Boolean/version and
  test-proof issues in 371,888 ms. The consolidated remediation admitted the fixture,
  treated copy as prerequisite truth, fixed SQ and bound exact derivation/packing. The one
  substantive re-review completed in 386,757 ms and returned REVISE for an unisolated
  missing-version term, a non-Prettier-stable packing instruction and a fact-only dirty
  description. All three are incorporated here: the sixth control row, whole-fixture
  `prettier-ignore` packing and fingerprint/resume-step truth. The reviewer did not return
  GO on these final bytes; no further model loop is permitted. Exact source-based
  disposition finds no mandatory finding left unaddressed, and Arben remains the human
  approval authority.
- After product coding, one bounded senior exact-diff review and one GitHub Copilot request.
  Copilot unavailable is unavailable, not pass.
- Consolidate real findings into one remediation pass. Re-review only after substantive
  diff change. Inspect Sonar, CodeQL, security and threads early.

Terminal Value Mode report records AI OS/Brain time, query latency/tokens/use/recovery,
approval-to-PR-ready time, reviewer findings/remediation/wait, E2E count/failures/reruns,
authority/protected drift/defects and factual `humanUseful` plus
`brain-authority-correct`. No ROI percentage without a comparable baseline.

## Admission shape

- outcomes: 1;
- writer paths: 8 required + 1 conditional deterministic metadata path;
- independent proof surfaces: 3 (branch unit; locale/i18n; exact-head integration);
- shared runtime consumers beyond entry: 0;
- special proof environments: 0 (Z620 is controlled execution placement, not a new
  product capability).

This remains within default admission budget. Contract closure covers callers,
read/write/delete, mount/error, capabilities, collectors and baseline ownership. After
exact gate approval, the admission receipt must bind the approved SHA and pass
`slice-admission-check.mjs`; it grants no authority itself.

## Publication, runtime, rollback

1. Finish the bounded final design review and consolidate mandatory corrections once.
2. Recount the final candidate. Arben approves exact ID/bytes/SHA-256.
3. Create one clean task-owned docs-only authority worktree from then-current main.
4. Publish byte-identical gate plus minimal current-program/current-tracker supersession,
   passing UI/UX and admission receipts, and no product file.
5. Run focused Tier-0 authority evidence, reviewer/feedback checks, merge exact head.
6. Publish only through governed task publication; no direct refresh or fabricated
   milestone.
7. Require Brain=current, Integrity=clear, zero contradictions, M1-M7 verified and exact
   AI OS/resolver agreement on this slice with runtime `not_authorized`.
8. Create immutable exact-main runtime receipt and stop for separate exact approval.
9. Only then: one product writer/worktree, RED/GREEN, governed heavy gates, one PR, one full
   exact-head CI E2E, merge, separate closeout PR if required, governed milestone, ledger/
   Brain/active-execution cleanup, Z620 sleep and terminal clean/synced main.

Before product merge, rollback is deletion of task-owned branch/worktree. After merge,
rollback is one product-merge revert; no schema/data/provider rollback exists.

## Non-goals

- No all-cause disabled-state engine or priority model.
- No copy composition from standalone button labels.
- No Submit label/eligibility or Save changes behavior change.
- No automatic save, submit, navigation, focus or announcement.
- No handoff/success/claim-link persistence or source/origin projection.
- No anonymous/inactive/member tree expansion.
- No Hero redesign or membership-dashboard work.
- No route/proxy, auth/session/OTP, tenancy, schema/RLS, billing/provider change.
- No docs/CI/infrastructure item promoted as the product slice.
- No AI OS/Brain/retrieval/KG/Atlas/model/configuration improvement.
- No Gemini maintenance/deletion and no second slice.

## Stop conditions

Stop for fresh authority if:

- exact approved hash/base/slice mismatches;
- Brain/Integrity/contradiction/M1-M7 checks fail or AI OS/resolver disagree;
- locale wording needs post-approval change;
- any cause besides sole dirty state needs specialization or precedence;
- changing Secure Save control availability or recovery behavior becomes necessary;
- any caller, lifecycle, action, route, auth, tenancy, schema, RLS, billing, provider,
  workflow or deployment file must change;
- helper/new test/E2E or tenth writer path is required;
- component/test exceeds 150 lines or old proof weakens;
- accessibility/layout/localization becomes misleading;
- a new state/persistence/shared-consumer/proof-environment contract appears;
- focused/reviewer/security/CI evidence is non-green or unresolved;
- final head changes after the sole full E2E lane;
- PR-ready work exceeds the 2-4 active-hour target without a smaller same-outcome recut;
- a second outcome or slice appears.

## Residual risks

- Five other disabled controls remain generic by design.
- Dedicated copy adds one locale field to a serialized object; exact parity and purity tests
  are mandatory.
- `conflict`, `limit`, `accountContext`, `loading` and `saving` may keep the dedicated
  prerequisite visible while Save changes is withheld; the existing band status owns the
  immediate recovery and this slice does not alter it.
- While the existing-claim lookup is checking, the dedicated sentence may render
  transiently before a found case replaces the block; B4/B5 structure remains unchanged.
- Off the neutral front door the Secure Save band is absent, but no draft can become active
  there, so `hasUnsavedChanges` and the dedicated branch are unreachable.
- Existing browser gates do not assert this exact dirty sentence; deterministic unit/i18n
  proof owns it and one full exact-head CI lane owns integration regression.
- Existing `member-claim-draft-intake.spec.ts` asserts generic copy before the first save,
  when no active dirty draft exists, so the new branch is unreachable and no E2E edit is
  required.
- Brain shortened current-authority orientation but did not select the successor; record it
  as orientation-only and never as promotion authority.

## Exact approval boundary

After bounded review and consolidated fix-first disposition, count this exact file with
`wc -c` and `shasum -a 256`.
Approval must name `IDA-DG34-UI03a2-B6-UNSAVED-CHANGES-SUBMIT-TRUTH`, exact bytes and exact
SHA-256. Any later byte change invalidates approval. Gate approval never substitutes for
runtime approval.
