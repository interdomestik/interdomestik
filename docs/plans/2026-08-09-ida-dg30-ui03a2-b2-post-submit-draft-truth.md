# IDA-DG30 — IDA-UI03a2-B2 Post-submit saved-draft separation truth

Status: consolidated candidate; not approved; not repository authority
Gate ID: `IDA-DG30`
Sole slice: `IDA-UI03a2-B2`
Base repository: `/Users/arbenlila/development/interdomestik-crystal-home`
Base branch: `main`
Base SHA: `c43380bc4ee68da3e1363780697ab3bfaa0b5c9b`
Classification: product-facing copy/i18n implementation
Risk tier: Tier 2
Runtime authorized: false
Deployment authorized: false
Production mutation authorized: false

## Decision

Promote no implementation yet. After exact-file approval and a docs-only authority merge,
promote exactly one product micro-slice: `IDA-UI03a2-B2`.

The sole user outcome is:

> After a canonical claim is successfully created from a saved Free Start draft, the
> access-active member sees that the claim was submitted, the saved draft remains a
> separate object, and later edits to that draft do not change the submitted claim.

The product implementation is copy-only. It changes the existing localized
`claims.wizard.submit_success` value in EN, SQ, MK and SR and strengthens focused proof.
It does not change a React component, server action, domain writer, route, selector,
schema, RLS policy, auth/session/tenant boundary, claim record, saved-draft record,
idempotency record, event, notification or provider effect.

The current phrase “submitted and saved” is deliberately retired because, beside a retained
saved draft, it can imply that the submitted case and saved preparation are one object. No
persistence fact is removed: the replacement keeps dashboard tracking and states the actual
retained-draft boundary more precisely.

## Current-authority evidence

- `node tools/ai-os-state.mjs --check --json` passed on 2026-08-09 with observation
  `369bfea88c1a6d00df1857ea197a0c9dc02b4cf648d1bbd8a14db43babde9766`:
  Brain `current`, Integrity `clear`, zero blocking contradictions, M1
  `verified_current`, M2/M3 `terminal`, M4/M5/M6 `no_qualified_candidate`, M7
  `no_authorized_enrollment`, and Atlas outside every cohort.
- Interdomestik was clean and synced on `main` at
  `c43380bc4ee68da3e1363780697ab3bfaa0b5c9b`; branch-hygiene report SHA-256 was
  `4f637246ebf8afca28d168fd69d3096975996d3717b4bb7bbaf010dff581949c`.
- Preflight passed. Resolver and scorecard correctly returned
  `blocked_requires_current_authority`, `activeSlice=null`, reason
  `umbrella_without_concrete_promoted_slice`. This gate is the required current-authority
  selection; it is not runtime authority.
- `docs/plans/current-tracker.md` records `IDA-UI03a2-B1` completed through PR `#1517`
  and states that no successor authority remains.
- `docs/plans/current-program.md` Rev 208, lines 6911–6919, explicitly leaves
  edit-after-success copy, handoff-context persistence, Hero redesign, membership
  dashboard and every further journey transition as separate unpromoted slices.
- The accepted B1 contract states that the source draft remains independently resumable,
  editable and deletable, while later draft edits do not alter the accepted claim snapshot.
  Current success copy does not disclose that boundary.
- Advisory Brain retrieval was current and returned the B1 gate and exact saved-draft
  success test among the strongest hits. Brain did not select or promote this slice;
  repository authority remains final.

## Candidate comparison

| Candidate | User value | Product paths | Contract/risk | Decision |
| --- | --- | ---: | --- | --- |
| Post-submit saved-draft separation truth | Removes a concrete misleading omission at the exact completed transition | 4 locale files | Existing behavior only; no runtime writer | Select |
| Persist handoff context after re-entry | Restores success/link state later | Requires a new persisted/read contract and broader ownership proof | Independent product capability | Reject for this gate |
| Add source badge/searchable origin linkage | Makes the saved draft list identify its claim | Requires authoritative origin-link semantics; B1 forbids inferring it from idempotency | Schema/read-model risk | Reject for this gate |
| State-specific disabled reasons | Explains pre-submit blockers | Different entry state and outcome | Separate future micro-slice | Defer |
| Hero redesign | Broader public experience work | Cross-component visual surface | Explicit separate phase | Exclude |
| Membership dashboard redesign | Broader authenticated IA | Shared dashboard surface | Explicit separate phase | Exclude |

The selected candidate is the smallest repository-supported user-visible continuation.
It closes only the explicit Rev 208 edit-after-success copy residual. It does not claim
that the full UI roadmap, Hero phase or membership-dashboard phase is complete.

## Entry, transition and exit state

### Entry

- Host and route remain the existing neutral member Claim Draft Intake route.
- The actor is the already-authorized access-active member admitted by B1.
- The member has resumed one complete, owner-scoped, saved vehicle/property Free Start
  draft and sees the existing review state.
- No new eligibility rule is introduced.

### Transition

- The member activates the existing submit action.
- Existing B1 code creates or recovers exactly one canonical numbered claim.
- Existing focus behavior moves to `claim-created-success`.
- This slice changes no transition mechanics or side effects; it changes only the truth
  rendered in the existing success output.

### Exit

- The success output states all four transition facts:
  1. the claim was submitted;
  2. it remains trackable from the dashboard;
  3. the saved draft remains separate;
  4. later draft edits do not change this submitted case.
- The existing localized “open claim” link remains present and unchanged.
- The source draft remains independently available after exit/re-entry, exactly as B1
  already proves.

## Frozen copy contract

Only `claims.wizard.submit_success` changes. Exact proposed values:

- EN: `Case submitted. You can track it from the dashboard. Your saved draft stays separate; later edits to the draft do not change this case.`
- SQ: `Rasti u dërgua. Mund ta ndiqni nga paneli. Skica juaj e ruajtur mbetet e veçantë; ndryshimet e mëvonshme në skicë nuk e ndryshojnë këtë rast.`
- MK: `Случајот е поднесен. Можете да го следите од контролната табла. Зачуваниот нацрт останува одделен; подоцнежните измени во нацртот не го менуваат овој случај.`
- SR: `Slučaj je podnet. Možete ga pratiti sa kontrolne table. Sačuvani nacrt ostaje odvojen; kasnije izmene nacrta ne menjaju ovaj slučaj.`

The submitted object must use the locale-owned noun already present in
`claims.wizard.submit_label` and `claims.success.go_to_claim`: case, rast, случај or
slučaj. The retained preparation object must use the locale-owned noun already present in
`claims.actions.editDraft`: draft, skicë, нацрт or nacrt. The existing dashboard-tracking
fact is preserved in all four locales.

The wording must not imply that:

- the draft is the claim;
- draft edits update, amend or supplement the claim;
- the claim can be edited through the draft;
- submission decides coverage, liability, payment or recovery;
- the source draft was deleted, consumed or attached to the claim;
- canonical origin linkage exists.
- resubmitting an edited draft creates a corrected or second claim.

## Frozen writer map — four product, three test and one conditional metadata path

Exactly four product files:

1. `apps/web/src/messages/en/claims.json`
2. `apps/web/src/messages/sq/claims.json`
3. `apps/web/src/messages/mk/claims.json`
4. `apps/web/src/messages/sr/claims.json`

Exactly three focused test files:

5. `apps/web/src/components/claims/claim-draft-intake/claim-draft-intake.test.tsx`
6. `apps/web/e2e/gate/member-claim-draft-intake.spec.ts`
7. `apps/web/src/components/claims/claim-draft-intake/saved-draft-submit.test.tsx`

One conditional deterministic metadata path is admitted only if the unchanged tracked-only
size synchronizer proves it changed:

8. `scripts/repo-size-budget.json`

No eighth non-metadata path and no ninth path are authorized. The four locale JSON files
are grandfathered at 191 lines and must not grow. The unit test is currently 146 lines and
the E2E spec 149 lines; `saved-draft-submit.test.tsx` is 143 lines. None may exceed 150
lines. Existing assertions may be replaced or compacted, but the slice does not authorize
a new helper or test file.

## Authority-publication writer map

After exact-hash approval, the docs-only gate branch may write only:

1. `docs/plans/2026-08-09-ida-dg30-ui03a2-b2-post-submit-draft-truth.md`
2. `docs/plans/current-program.md`
3. `docs/plans/current-tracker.md`
4. `scripts/repo-size-budget.json` only if the unchanged tracked-only synchronizer changes it

No product file may change in the authority PR. The authority merge must promote only
`IDA-UI03a2-B2` with `runtime_authorized:false`.

## Contract graph

### Nodes

- `N1 translation-source`: four authoritative locale values at
  `claims.wizard.submit_success`.
- `N2 translation-loader`: existing `useTranslations('claims')` call in
  `claim-draft-intake/index.tsx`; read-only for this slice.
- `N3 submit-copy-prop`: existing `SavedDraftSubmitCopy.success`; read-only.
- `N4 success-output`: existing `claim-created-success` output in
  `dormant-preview.tsx`; read-only.
- `N5 canonical-claim-link`: existing locale-scoped member claim link; read-only.
- `N6 source-draft-store`: existing owner-scoped saved draft; read-only and unchanged.
- `N7 canonical-claim-store`: existing B1 canonical submitted claim; read-only and unchanged.
- `N8 unit-collector`: focused locale contract in `claim-draft-intake.test.tsx`.
- `N9 browser-collector`: existing `member-claim-draft-intake.spec.ts` B1 flow.
- `N10 current-copy-baseline`: current four locale values on base SHA.
- `N11 component-fixture-collector`: existing `saved-draft-submit.test.tsx`; its synthetic
  English success fixture is updated to the approved EN value without changing component
  behavior. It proves that the success prop renders in an output, receives focus and retains
  the claim link. It is a synchronized render fixture, not a locale-loader proof.

### Edges

- `E1 N1 -> N2`, operation `locale read`.
- `E2 N2 -> N3`, operation `typed copy projection`.
- `E3 N3 -> N4`, operation `render after successful submit`.
- `E4 N4 -> N5`, operation `present unchanged next action`.
- `E5 N6 -> N7`, operation `existing B1 submit/recovery behavior`; no edge is added or
  changed by this slice.
- `E6 N1 -> N8`, operation `four-locale exact-string contract proof`.
- `E7 N4 -> N9`, operation `visible exact-SQ-copy browser proof`.
- `E8 N6 -> N9`, operation `existing source-draft retention proof`.
- `E9 N1 -> N10`, operation `better-than-baseline comparison`.
- `E10 N3 -> N11`, operation `existing prop/render/focus/link fixture proof`.

### Closure

- Callers: complete. The exact key is read only by the existing claims namespace path and
  rendered through the existing submit-copy prop.
- Shared consumers: none beyond the existing Claim Draft Intake success output.
- Read/write/delete: only N1 is written; N2–N7 are read-only and no store is mutated by the
  copy change.
- Mount/error paths: success is mounted only after existing `result.success`; failure and
  unexpected-error copy remain unchanged.
- Capability requirements: standard locale loading and the existing B1 browser flow only;
  no new browser API, DB, provider or feature capability.
- Test collectors: N8, N9 and N11 are the exact writer-path collectors. N8 owns the four
  real-locale string contract; N9 owns production-path SQ rendering and B1 continuation;
  N11 owns generic success render/focus/link semantics with the synchronized EN fixture.
  Required skips fail.
- Baseline ownership: N10 is owned by the four current locale files on the bound base SHA.

## UI/UX benchmark

Observed 2026-08-09 from official public operator sources. Authenticated claim-confirmation
screens were not accessed.

| Operator | Official source | Relevant principle |
| --- | --- | --- |
| Progressive | `https://www.progressive.com/claims/faq/how-to-report-a-claim/` | Confirmation gives a claim number; later work is tracked on the filed claim. |
| Allstate | `https://www.allstate.com/en/help-support/claims/faqs` | A submitted claim becomes a distinct MyClaim object with its own status/contact path. |
| GEICO | `https://claims.geico.com/ClaimsExpress/Locate` | Claim access is keyed by the issued claim number and continues in the claim dashboard. |
| Lemonade | `https://www.lemonade.com/renters/explained/how-to-file-a-renters-insurance-claim/` | After submission, progress and additional needs are tracked against the claim/reference. |

Blocked-source accounting:

- Progressive authenticated confirmation: policy/claim credentials required; not accessed.
- Allstate MyClaim confirmation: policy/claim credentials required; not accessed.
- GEICO claim dashboard: claim identity/credentials required; not accessed.
- Lemonade in-app confirmation: policy/app credentials required; not accessed.

Comparison criteria:

1. Does the success state establish one canonical submitted-claim identity and next action?
2. Does it prevent the user from mistaking a retained preparation draft for the submitted
   claim or believing later draft edits modify that claim?

Better-than-baseline outcome:

- Metric: explicit critical transition/state-boundary facts in the success message.
- Unit: facts present out of four.
- Direction: higher.
- Baseline on `c43380bc...`: 2/4 (submission and dashboard tracking are stated; draft
  separation and edit isolation are absent).
- Target: 4/4 with no baseline fact removed.
- Method: deterministic four-locale exact-string contract, per-locale reviewer disposition
  and exact-browser rendered-copy proof in the authoritative SQ gate lane.

Anti-copy/trade-dress boundary: use only the general principle that post-submit work belongs
to a distinct claim identity. Do not copy operator wording, layout, branding, illustration,
motion or distinctive trade dress. Interdomestik’s retained-draft separation sentence is
specific to its own B1 contract.

The benchmark sources are advisory. Repository source and tests define the actual product
truth.

## Acceptance criteria and tests

### A1 — RED/GREEN four-locale semantic contract

Modify `claim-draft-intake.test.tsx` first so it fails against base copy and requires each
real EN/SQ/MK/SR `claims.wizard.submit_success` value to equal the approved locale-owned
value and preserve the same four facts: submitted case, dashboard tracking, separately
retained saved draft/skicë/нацрт/nacrt, and no effect from later draft edits. This is an
exact string-contract check, not four-locale rendered semantic proof. Per-locale review and
Arben's exact-hash disposition own semantic approval; the SQ browser collector proves one
real locale renders through the production path.

The 146-line test has four lines of headroom. Add one `// prettier-ignore` and one packed
four-value equality assertion inside the existing locale test; final formatted length must
remain at or below 150. Do not add a helper or duplicate locale parser.

Focused command:

`pnpm --filter @interdomestik/web test:unit --run src/components/claims/claim-draft-intake/claim-draft-intake.test.tsx`

Expected: RED before locale mutation, GREEN after it, no skip.

### A2 — Rendered success and unchanged claim continuation

On the existing `gate-ks-sq` scenario, add only the true delta: one import of the real SQ
claims messages and replace the existing success visibility assertion with exactly:

`await expect(success).toContainText(sq.claims.wizard.submit_success, { timeout: 15_000 });`

This one new import and replacement leave the 149-line E2E spec at exactly 150 lines. The
locale-derived claim-href regex, claim number, link click, claim-detail continuation and
retained-draft re-entry assertions remain textually and semantically unchanged. No viewport,
zoom, hardcoded locale, overflow predicate or compaction is allowed. The standalone
visibility assertion is intentionally superseded by the exact-copy assertion; the existing
claim-link click retains Playwright's visible/stable/enabled actionability proof. No other
B1 assertion may be removed or weakened.

Expected: the focused exact-head browser scenario passes with zero retry; the approved SQ
copy renders through the production translation path, and the existing canonical claim
number/link/detail and retained source-draft re-entry proof stays green. Skipped is failure.

### A2b — Generic success render fixture

Update only the existing one-line `submitCopy.success` fixture in
`saved-draft-submit.test.tsx` to the approved EN value. Existing assertions must continue to
prove output/status semantics, focus, exactly-once submit, canonical link and bounded retry.
No new test case or line growth is authorized.

### A3 — i18n integrity

`pnpm i18n:check && pnpm i18n:purity:check`

Expected: pass with all four active locales and no key/purity drift.

### A4 — Scope and modularity

- `pnpm check:modularity-guard`
- `pnpm check:e2e-contracts`
- `node scripts/repo-size-budget-sync.mjs --check`
- if and only if the size check reports tracked drift, run unchanged
  `node scripts/repo-size-budget-sync.mjs --tracked-only`, admit only
  `scripts/repo-size-budget.json`, then run `pnpm repo:size:check`.
- `git diff --check`
- `interdomestik_qa` scope audit with only the frozen paths allowed and protected paths
  denied.

Expected: pass; product JSON files do not grow in lines; all three focused test files remain
at or below 150 lines; no unapproved path.

### A5 — Required exact-head evidence order

1. Focused RED/GREEN unit evidence.
2. i18n, modularity, E2E-contract and repo-size proof.
3. Governed Z620 preflight and only the focused saved-draft browser scenario; Z620 must be
   connected and listening before the lane starts. The 2026-08-09 design canary observed
   `interdomestik-z620`, Docker 29.6.2 and 20,016,644 KiB available. This is sufficient only
   as focused-browser readiness, not full-build/full-E2E authority. Its evidence is 391 bytes,
   SHA-256 `af18c4eae5b31c9dc25e4ae24b697098bd021835ce2536a3701d2c0bb60498ee`.
   No Mac Docker.
4. Bounded senior review and early Sonar/Copilot/review-thread intake after PR opens.
5. Exactly one completed full E2E authority lane in CI on the final reviewed PR head.
6. Mandatory repository checks `pnpm pr:verify`, `pnpm security:guard` and `pnpm e2e:gate`
   must be green through their authoritative current-head CI contexts without counting the
   same E2E completion twice.
7. Rerun only evidence invalidated by substantive remediation or a changed head/surface.

## Highest-risk cases

1. Translation drift says the case and draft are the same object.
2. Translation drift implies later draft edits update or supplement the submitted claim.
3. The real SQ translation does not reach the existing success output, while fixture-only
   component proof remains green. N9 binds the real production translation path.
4. Success focus or live-output semantics regress because a test change accidentally widens
   runtime scope.
5. The existing B1 re-entry proof is weakened, skipped or moved to a non-authoritative
   project.
6. A reviewer tries to solve handoff persistence or source linkage inside this copy slice.

## Accessibility and frontend posture

- No component or server/client boundary changes.
- Existing `output`, programmatic focus, claim link, keyboard behavior and ARIA semantics
  remain unchanged.
- No CSS, fixed-height, overflow or layout class changes. The copy uses ordinary wrapping
  text in the existing block output. This slice makes no new viewport, zoom or cross-locale
  layout claim; any observed clipping or overlap is a stop condition and requires a separate
  UI gate rather than a hidden component edit.
- No focus steal occurs before success; existing success focus remains after submit.

## Security, privacy, tenancy and operations

- No PII or draft facts enter the copy.
- No log, metric, event, audit row or analytics field changes.
- No auth/session/role/access-tenant/home-tenant/legal-tenant behavior changes.
- No schema, migration, RLS, database role or storage behavior changes.
- No route, `proxy.ts`, canonical marker or tenant-host behavior changes.
- No billing, Paddle, entitlement, coverage, liability, legal advice or payment claim is
  introduced.
- No provider, queue, webhook, email, notification, deployment or production mutation.
- Failure/degraded behavior remains the existing B1 behavior; this copy appears only after
  existing success.
- Performance/cost impact is limited to a few additional locale bytes; no bundle, query,
  network or runtime dependency is added.

## Reviewer matrix

- Senior product/copy/accessibility/contract review: Claude Opus 5, one bounded 30-minute
  route when quota is available; do not resend a running request.
- Product/UX/i18n: verify the four facts in all four locales and anti-overclaim language.
- Security/auth/tenancy: confirm not applicable beyond proving no protected writer path.
- Performance: confirm no component/bundle/runtime expansion; no new layout claim is made.
- QA/E2E: verify RED/GREEN, exact locale assertion, focus/link and retained-draft regression.
- Copilot: required once the implementation PR opens and again only after substantive
  remediation; classify exact unavailability if no artifact materializes.
- Sonar/CodeQL/security/review threads: inspect early and again at terminal current head.
- Fable 5: skipped unless access is confirmed restored; it is not a default route.

### Design review disposition

- Claude Opus 5 review ran as one bounded route per substantive revision: the first review
  returned P0/P1 findings after about 427 seconds; the remediated review returned P1 findings
  after about 576 seconds; the final review passed with no P0/P1 after about 504 seconds.
- Remediation corrected locale nouns, restored the dashboard-tracking fact, removed
  unsupported overflow/zoom assertions and preserved locale-derived routing plus the
  150-line E2E ceiling.
- The only final P2 was a wording inconsistency in this packet about replacing the existing
  visibility assertion. It was corrected without changing product scope or implementation;
  the exact-copy assertion intentionally supersedes that visibility assertion while the
  existing `claimLink.click()` continues to prove actionability. No rereview is required for
  that non-substantive artifact clarification.

## Rollout, rollback and migration compatibility

- Rollout: ordinary merged locale-copy rollout; no feature flag is added because there is no
  new behavior or side effect to gate.
- Rollback: revert only the exact product merge. Trigger on semantic mistranslation,
  success-region accessibility/overflow regression or conflict with canonical B1 behavior.
- No database/data rollback, draft cleanup, claim rewrite, backfill, provider rollback or
  deployment mutation is authorized.
- Compatibility: translation key and runtime shape remain unchanged, so existing callers,
  cached message loading and older sessions retain the same contract. A normal application
  release may carry the copy later; this task does not deploy it.

## Stop conditions

Stop and return for a new consolidated gate if any of the following is discovered:

- any component, action, domain, route, schema, migration, RLS, auth, tenancy, billing,
  provider, CI/workflow or deployment file must change;
- a new translation key, new locale namespace or eighth non-metadata writer path is needed;
- the product request becomes handoff persistence, source badge, searchable origin linkage,
  submitted-claim mutation or draft-to-claim synchronization;
- the existing success result lacks enough truth to make the copy accurate;
- a locale cannot preserve all four facts without material product/legal review;
- any focused test file must exceed 150 lines or a new test helper/file is needed;
- the longer copy requires a component/CSS/layout correction or produces observed clipping,
  overlap or hidden claim-link behavior;
- exact-head focused proof, i18n, protected scope, reviewer, Sonar, security or required CI
  evidence is not green/classified;
- Z620 is not connected/listening for the focused browser lane;
- the final PR head changes after the sole completed full E2E authority lane;
- throughput is no longer credible within 2–4 active hours.

## Non-goals

- No Hero redesign or public-header work.
- No membership-dashboard redesign or primary/secondary action reprioritization.
- No anonymous, inactive-member or active-member entry-tree expansion.
- No saved-draft state badge, claim-origin field, source linkage, search or list projection.
- No persistence of success, claim link or handoff context after exit/re-entry.
- No edit/delete semantics change and no claim update from later draft changes.
- No pre-submit disabled-state copy changes.
- No new claim, draft, idempotency, lifecycle, event, audit or notification behavior.
- No personal-injury expansion, documents/uploads, AI, provider, billing or deployment.
- No README, AGENTS, architecture ADR, broad tracker rewrite or technical prerequisite slice.

## Residual risks

- The success/link state is still not persisted after re-entry; the source draft remains
  independently visible without a claim-created badge. That is intentional and must be a
  separately designed product slice.
- A user may still revisit and submit the retained draft; B1 returns the existing claim, but
  this gate does not add a persisted badge or pre-submit explanation for that re-entry state.
- Public benchmark evidence cannot inspect authenticated operator confirmation screens; the
  benchmark therefore supports general claim-identity principles, not visual imitation.
- Final localized wording remains subject to Arben’s exact-hash approval and bounded reviewer
  disposition; no model can grant repository authority.

## Publication and execution sequence

1. Arben approves this exact candidate by byte count and SHA-256.
2. Create one task-owned docs-only branch/worktree from the exact clean current main.
3. Publish only the authority writer map, run focused Tier-0 proof, bounded review if the
   exact artifact changed, open one authority PR, merge only exact reviewed head and clean it.
4. Rerun AI OS check, preflight, resolver and scorecard. Resolver must select only
   `IDA-UI03a2-B2` with runtime unauthorized.
5. Prepare one exact-main runtime receipt binding this gate, admission evidence, UI/UX
   receipt, product writer map, task/thread and exclusions; stop for Arben’s exact-hash
   approval.
6. Register active execution and open a prospective Brain product session before coding.
7. Create one fresh product worktree and one writer. Start with the focused RED test.
8. Implement only the four locale values, conditional size metadata and frozen tests.
9. Run focused evidence first, one bounded senior review, one Copilot request, early feedback
   intake, and exactly one full E2E completion in CI on final reviewed head.
10. Merge only exact reviewed current head after CI, Sonar, CodeQL, security, feedback and
    finalizer are green or explicitly classified.
11. Contain automatic CD before provider/deploy effects; do not deploy or mutate production.
12. Close tracker, Brain session and milestone; verify exact clean/synced main; remove exact
    merged branch/worktree; rerun resolver/scorecard; do not begin a second slice.

## Admission summary

- Product outcomes: 1.
- Product writer paths: 4.
- Test writer paths: 3.
- Conditional metadata paths: 1.
- Independently invalidatable proof surfaces: 3 (four-locale exact string contract with
  reviewer disposition, one-locale focused rendered browser flow, current-head
  repository/CI gates). Only the SQ surface is claimed as real-locale rendered proof.
- Shared runtime consumers beyond entry: 0.
- Special proof environments: 1 (governed Z620 focused browser lane); CI is merge authority.
- Highest-risk cases, rollback, graph closure, acceptance matrix and stop conditions are
  defined above.
- Admission can bind this candidate hash after it is computed. UI/UX approval remains
  pending and must use Arben’s exact gate/hash receipt; no approval is fabricated here.

## Approval boundary

This artifact grants no authority by existing. Approval must name exactly:

`IDA-DG30-UI03a2-B2-POST-SUBMIT-DRAFT-TRUTH`, its exact UTF-8 byte count and exact SHA-256.

After approval, only the docs-only authority-publication sequence may begin. Product coding
still waits for merged gate authority, fresh resolver selection and a separately approved
exact-main runtime receipt.
