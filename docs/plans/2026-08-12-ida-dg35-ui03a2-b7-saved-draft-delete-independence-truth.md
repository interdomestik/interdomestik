---
document_id: IDA-DG35-UI03a2-B7-SAVED-DRAFT-DELETE-INDEPENDENCE-TRUTH
date: 2026-08-12
status: consolidated_candidate_not_approved
authority: external_advisory_until_exact_hash_approval_and_docs_only_canonical_merge
base_sha: da7a2173ac2159a5755e002921f63228799596c0
resolver_before_gate: blocked_requires_current_authority
active_slice_before_gate: null
proposed_slice: IDA-UI03a2-B7-SAVED-DRAFT-DELETE-INDEPENDENCE-TRUTH
risk_tier: 2
runtime_authorized: false
product_mutation_authorized: false
deployment_authorized: false
production_authorized: false
value_mode_measurement: 2/3
---

# IDA-DG35 — UI03a2-B7 saved-draft delete independence truth

## Decision and authority boundary

Propose exactly one future Tier 2 product/copy/i18n slice:
`IDA-UI03a2-B7-SAVED-DRAFT-DELETE-INDEPENDENCE-TRUTH`.

One user outcome only: after a submitted case has been created from a retained saved
vehicle/property draft, the verified member sees in both existing success origins that
editing or deleting the saved draft later does not change or delete the submitted case.

This candidate is not repository authority. It authorizes no product branch, worktree,
Brain product session, active execution, E2E, product mutation, runtime, deployment or
production effect. Arben must approve the final exact identifier, UTF-8 byte count and
SHA-256 before the byte-identical artifact can enter one docs-only authority PR. Gate
approval is not runtime approval. Product work requires a later exact-main runtime receipt
and separate exact approval after the gate merges and AI OS plus the resolver agree.

## Verified starting state and Value Mode controls

Observed 2026-08-12:

- Interdomestik `main == origin/main ==`
  `da7a2173ac2159a5755e002921f63228799596c0`; main is clean.
- The only worktree is canonical `main`; local/remote `codex/*` namespace is clean.
- Canonical preflight passes with branch-hygiene report SHA-256
  `b437505dbaf619161b712ce1fb07ff000eb40bb4dcdde628ad012aaca43fed8a`.
- Canonical resolver returns `blocked_requires_current_authority`, reason
  `umbrella_without_concrete_promoted_slice`, source `docs/plans/current-tracker.md`,
  `activeSlice=null`.
- Workflow scorecard passes new-slice branch readiness and blocks only because no active
  slice and gate plan exist.
- Governed publication reconciled the user-owned Value Mode 2/3 contract without direct
  refresh, AI OS repair or fabricated product milestone. Post-publication AI OS observation
  `20e9a25f4000d448d82b84ca7e9c13054ac3d96df5222d88fcc75cc35e3332f8`
  proves Brain=current, Integrity=clear, zero blocking contradictions and M1-M7 verified.
  Interdomestik is authority=current, activeSlice=none, runtime=not_authorized.
- The heavy-job controller is idle and active execution is absent. No Z620 work, build,
  product E2E or product mutation was consumed during discovery.
- User-owned `log.md` and the Value Mode contract remain preserved.

Value Mode orientation used exactly one focused Brain query, no recovery query/search:

- query: `Interdomestik next governed product slice current authority after
  IDA-UI03a2-B6 for Value Mode 2/3`;
- process wall: 1.34 seconds;
- retrieval latency: 463 ms;
- returned context: approximately 442 tokens;
- useful result: canonical current-tracker and current-program locators;
- authority result: locator-only; Brain neither selected nor promoted this candidate;
- recovery count: 0.

Repo AGENTS, current-program, current-tracker, architecture tracker, source and tests remain
final authority. No broad retrieval loop was used.

## Repository-supported selection

Current-program/current-tracker Rev 219 consume completed
`IDA-UI03a2-B6-UNSAVED-CHANGES-SUBMIT-TRUTH` and require fresh current-authority
selection. The completed B1-B6 chain established:

1. one canonical numbered claim can be submitted from one complete owner-scoped saved
   draft without retyping six facts;
2. the submitted claim and saved draft remain independent records;
3. later draft edits do not change the claim;
4. an existing deterministic case is restored on verified owner/tenant re-entry;
5. fresh-submit and background-lookup success origins have distinct truthful copy; and
6. the sole-unsaved-changes disabled Submit cause has a dedicated next-action explanation.

The original accepted parent gate `IDA-DG19` requires the source draft to remain separately
editable/deletable, says deleting the draft later deletes only the draft, and requires
truthful edit/delete distinction in acceptance cases C20-C21. B1 preserved that runtime
contract and its acceptance tests, but intentionally excluded a source-list badge and broader
origin projection. Current production success copy names later edits but omits deletion:

- fresh `claims.wizard.submit_success`: the saved draft stays separate and later edits do
  not change the case;
- re-entry `draftIntakeCopy.existingCaseSuccess`: later edits do not change the case.

This is a new user-visible truth gap, not regression evidence and not reopening any completed
slice. The underlying independence behavior is already authoritative and tested. The smallest
honest continuation is to expose that already-shipped delete independence in the two existing
success strings, with no new state, component branch, reader, writer or persistence contract.

This B7 gate explicitly supersedes only B5's section `Frozen localized copy contract` for
`claims.wizard.submit_success` and `draftIntakeCopy.existingCaseSuccess`. The eight exact B7
values below become the new frozen set. Every other B5 authority, origin branch, writer,
acceptance case, exclusion and closeout fact remains unchanged. This ordering prevents two
completed gates from claiming competing current localized values.

Completed `IDA-UI06a`, `IDA-UI06b`, `IDA-UI03b`, `IDA-UI03a2-P0a2a`, B1-B6 and PR
`#1514` remain closed absent regression evidence.

### Candidate comparison

| Candidate | User value | Product writers | New trust/state contract | Decision |
| --- | --- | ---: | --- | --- |
| Dual-origin delete-independence truth | Prevents a member from believing draft deletion can delete the submitted case | 4 locale files | none | Select |
| Per-cause disabled-state expansion | Gives more pre-submit explanations | component + locales | cause precedence | Defer |
| Source-list claim-created badge | Shows linkage before resume | UI + read model | provenance/read contract | Defer |
| Persisted handoff/source linkage | Restores durable source context broadly | persistence/schema/readers | yes | Defer |
| Hero redesign | Broad anonymous experience | cross-component | separate phase | Exclude |
| Membership dashboard | Broad authenticated IA | shared dashboard | separate phase | Exclude |

The selected candidate uses exactly four product files plus focused tests. It is the smallest
remaining repo-supported user-visible product truth and remains credible for a 2-4 active-hour
PR-ready target. It neither reserves a successor nor claims completion of the full journey tree.

## Risk tier

**Tier 2 — product-facing copy/i18n, no component or protected runtime mutation.**

The user-visible and screen-reader-visible success message changes in four locales and two
origins. Exact semantic parity, origin distinction, line-length/layout regression and existing
browser collector proof are required. No route, `proxy.ts`, auth, session, tenancy, schema,
RLS, billing, action, claim/draft reader or writer, provider, deployment or production surface
changes. Any need for one of those surfaces escalates and stops this gate.

## One user outcome

When a submitted case exists for the retained saved draft, both success origins explicitly
state all of the following:

1. one submitted case exists and is trackable from the dashboard;
2. the saved draft remains a separate record; and
3. editing or deleting the saved draft later does not change or delete the submitted case.

No deletion is performed or offered by this slice. The statement describes the already-shipped
record-independence contract. It is not a retention guarantee for the case, a promise that every
account operation preserves it, or an authorization to delete claim data.

## Entry, transition and exit state

### Entry A — fresh canonical submit

- Verified access-active member on the canonical neutral Claim Draft Intake route.
- One complete owner-scoped saved vehicle/property draft has been submitted through B1.
- Canonical claim id/number and `origin='user_submit'` are present in the existing component
  state; the source draft remains separately persisted.
- Existing B2 success truth and canonical claim link are rendered.

### Entry B — existing-case re-entry

- The same verified owner/tenant resumes the retained saved draft.
- B4's strict read-only lookup restores the canonical existing claim id/number.
- `origin='background_lookup'` selects B5's distinct existing-case success copy.
- No submit action or second writer is available.

### Single transition

Only locale-owned message values change:

- fresh-submit success appends the truthful consequence that editing or deleting the saved
  draft later does not change or delete this case;
- background-lookup success appends the equivalent truthful consequence while preserving
  its distinct “already exists” opener.

`DormantPreview` continues to choose the same key from the same immutable `origin`; no JSX,
branch, effect, focus, ARIA, link, action, hook, reader or state machine changes.

### Exit

- The same existing `<output>` and canonical claim link remain rendered.
- Fresh submit and re-entry remain textually distinct but semantically aligned on source
  independence.
- The source draft remains independently resumable, editable and deletable under existing
  authority. The submitted case remains independently trackable.
- No draft or claim record, lifecycle, event, audit, notification or membership state changes
  because of this copy slice.

## Exact copy contract

The future implementation must use the following exact meaning. Final locale wording may be
corrected only before exact approval; any later byte change requires a new consolidated gate.

### English

- Fresh: `Case submitted. You can track it from the dashboard. Your saved draft stays
  separate; if you edit or delete the draft later, that does not change or delete this case.`
- Existing: `There is already a submitted case for this saved draft. You can track it from
  the dashboard. If you edit or delete the saved draft later, that does not change or delete
  the case.`

### Albanian

- Fresh: `Rasti u dërgua. Mund ta ndiqni nga paneli. Skica juaj e ruajtur mbetet e veçantë;
  nëse e ndryshoni ose e fshini skicën më vonë, kjo nuk e ndryshon dhe as nuk e fshin këtë
  rast.`
- Existing: `Për këtë skicë të ruajtur ekziston tashmë një rast i dërguar. Mund ta ndiqni nga
  paneli. Nëse e ndryshoni ose e fshini skicën e ruajtur më vonë, kjo nuk e ndryshon dhe as
  nuk e fshin rastin.`

### Macedonian

- Fresh: `Случајот е поднесен. Можете да го следите од контролната табла. Зачуваниот нацрт
  останува одделен; ако подоцна го измените или избришете нацртот, тоа не го менува ниту го
  брише овој случај.`
- Existing: `За овој зачуван нацрт веќе постои поднесен случај. Можете да го следите од
  контролната табла. Ако подоцна го измените или избришете зачуваниот нацрт, тоа не го менува
  ниту го брише случајот.`

### Serbian

- Fresh: `Slučaj je podnet. Možete ga pratiti sa kontrolne table. Sačuvani nacrt ostaje
  odvojen; ako nacrt kasnije izmenite ili izbrišete, to ne menja niti briše ovaj slučaj.`
- Existing: `Za ovaj sačuvani nacrt već postoji podnet slučaj. Možete ga pratiti sa kontrolne
  table. Ako kasnije izmenite ili izbrišete sačuvani nacrt, to ne menja niti briše slučaj.`

Every locale must preserve the same facts without implying that deletion is automatic,
recommended, reversible or performed from the success surface.

## Exact writer map

Product/i18n files — exactly four:

1. `apps/web/src/messages/en/claims.json`
2. `apps/web/src/messages/sq/claims.json`
3. `apps/web/src/messages/mk/claims.json`
4. `apps/web/src/messages/sr/claims.json`

Focused test collector — exactly one:

5. `apps/web/src/components/claims/claim-draft-intake/claim-draft-intake.test.tsx`

Conditional deterministic metadata — at most one:

6. `scripts/repo-size-budget.json`

The metadata path is admitted only if the unchanged canonical size synchronizer requires the
new exact bytes. It cannot absorb unrelated growth or user-owned worktree state.

No other path may be written. Current blobs are bound at base:

- EN `89e898ab576576c48ad34d09c11719503fcbe774`;
- SQ `375826e03211d7d0105a7b54ec6199d1c2ba5662`;
- MK `3cc5cdc80139e35a924239647c7dcfdac3d65515`;
- SR `3805eceb10631aa97416b30aae5c6cc79981afe2`;
- locale collector `16639cef7b9b29790e9ffe70d959eb8214e6af33`;
- size metadata `4126a924a0b151f5f995629f264c94c6594de283`.

The existing component, action, browser collector, `saved-draft-submit.test.tsx`,
`saved-draft-reentry.test.tsx` and every protected surface are read-only. Those two origin
unit tests already prove unchanged branch selection/output/link behavior with intentionally
local fixtures; they do not import production locale data and therefore cannot provide the
copy RED. The locale collector is the sole test writer and must remain at or below its current
150 lines. Its exact assertions must be rewritten line-neutrally; no helper or new file is
authorized.

## Contract graph and closure

### Nodes

- `N1 fresh-submit-entry`: existing B1 success with `origin=user_submit`.
- `N2 reentry-entry`: existing B4 lookup success with `origin=background_lookup`.
- `N3-N6 locale-stores`: existing EN/SQ/MK/SR claims JSON values.
- `N7 dormant-preview-consumer`: unchanged key selection and output/link rendering.
- `N8 locale-unit-collector`: exact eight-string parity and semantic assertions.
- `N9 origin-unit-collectors`: unchanged read-only fresh-submit and re-entry render assertions.
- `N10 browser-collector`: unchanged `member-claim-draft-intake.spec.ts` imported-locale
  proof on the canonical `gate-ks-sq` flow.
- `N11 baseline-authority`: IDA-DG19 delete independence plus completed B1/B4/B5 behavior.

### Edges

- `E1 N1 -> N7`: select unchanged fresh-submit key.
- `E2 N2 -> N7`: select unchanged existing-case key.
- `E3-E6 N3-N6 -> N7`: parse and render locale-owned copy without fallback/interpolation.
- `E7 N8 -> N3-N6`: prove all four locale pairs and origin distinction.
- `E8 N9 -> N7`: prove both exact origin outputs retain the canonical link and no action.
- `E9 N10 -> N7`: prove existing browser flow renders current SQ locale values after submit
  and re-entry; no browser test writer is needed.
- `E10 N11 -> N1,N2`: bind text to already-shipped independent-record behavior.

### Closure disposition

- Callers: complete; `DormantPreview` is the only runtime consumer of both values.
- Shared consumers: complete; one unchanged consumer, no new runtime consumer.
- Read/write/delete: complete; locale reads only, no product read/write/delete primitive.
- Mount/error paths: complete; existing success output and link only; failure paths do not
  render success copy.
- Capability requirements: complete; no special browser, database, provider or host feature.
- Test collectors: complete; one exact production-locale collector, two unchanged read-only
  origin render collectors and the unchanged current-locale browser flow.
- Baseline ownership: complete; B1/parent gate own record independence, not this copy slice.

Any discovered second consumer, action, state branch, persistence path or independent proof
environment is a stop-and-re-gate condition.

## UI/UX benchmark and measurable outcome

Observed 2026-08-12 UTC from public official sources; authenticated operator confirmation
screens were not accessed:

1. GOV.UK Design System “Check answers” separates review/change from the explicit final send
   action and requires the action's effect to be clear:
   `https://design-system.service.gov.uk/patterns/check-answers/`.
2. HM Land Registry separates pre-submit Saved Applications, which can be edited/deleted,
   from post-submit receipt/reference tracking:
   `https://www.gov.uk/guidance/working-with-colleagues-applications`.
3. Civil Service Jobs separates partially completed applications from submitted applications
   and their later tracking:
   `https://www.gov.uk/guidance/using-the-civil-service-jobs-website`.
4. GEICO separates reporting a claim from tracking a claim by claim number:
   `https://www.geico.com/claims/`.

Blocked-source accounting: zero required source fetches blocked. Private authenticated
confirmation and draft-deletion screens were not claimed as observed; the benchmark supports
only lifecycle separation and explicit consequence principles.

Comparison criteria:

1. Does each success origin distinguish the submitted case from the editable/deletable saved
   source without implying synchronization?
2. Does the copy give the consequence of later source deletion without inventing a delete
   operation, retention guarantee or second submission?
3. Does fresh-submit copy remain distinct from already-exists re-entry copy?

Better-than-baseline outcome:

- Metric: success origins that explicitly state saved-draft deletion does not delete the case.
- Unit: origins out of two (`user_submit`, `background_lookup`).
- Baseline: 0 of 2.
- Target: 2 of 2, higher is better.
- Method: exact four-locale unit assertions plus both origin render collectors and unchanged
  canonical browser flow.

Anti-copy/trade-dress boundary: learn only lifecycle-separation and explicit-consequence
principles. Do not copy distinctive words, layout, branding, illustration, interaction sequence
or trade dress from any operator.

The prospective UI/UX receipt must remain approval-pending until Arben approves this exact
gate. It must pass the advisory checker before promotion; no approval timestamp or receipt may
be fabricated.

## TDD and acceptance matrix

### First implementation action — RED

On the exact approved base, update only the two existing exact arrays at
`claim-draft-intake.test.tsx:146,148` so both origins and all four production locales require
delete-independence truth. Run the focused unit command and observe failure against unchanged
locale production values. `saved-draft-submit.test.tsx` and `saved-draft-reentry.test.tsx` are
read-only behavior collectors and explicitly provide no locale RED signal. Do not edit fixtures
or component code to make the RED fail.

### GREEN

Change only the eight existing locale values (two keys in each of four files), then rerun the
same focused tests. If deterministic size metadata requires correction, run the unchanged
canonical synchronizer and admit only its exact output.

### Acceptance cases

1. EN/SQ/MK/SR fresh success retains submitted-case, dashboard, separate-draft and later-edit
   truth and adds that later draft deletion does not delete the case.
2. EN/SQ/MK/SR existing-case success retains the distinct “already exists” opener, dashboard
   tracking and later-edit truth and adds equivalent deletion independence.
3. Neither origin says the draft was deleted, recommends deletion, claims deletion is reversible,
   offers a delete action or claims the case can never be retained/deleted under other authority.
4. Fresh and background origins remain distinct; `DormantPreview` key selection is unchanged.
5. Canonical claim link, `<output>`, focus behavior, accessible success status and no-second-submit
   behavior remain unchanged.
6. Existing B3/B6 disabled Submit explanations and every non-success locale key remain byte-for-
   byte unchanged.
7. The sole test writer remains at or below 150 lines; the two read-only origin fixtures and
   their assertions remain unchanged and green.
8. Existing canonical `member-claim-draft-intake.spec.ts` renders imported current SQ copy for
   fresh submit and retained-draft re-entry without an E2E-file change.
9. i18n parity/purity, repository size, modularity, protected-path and required Tier 2 gates pass.
10. Exactly one full exact-head CI E2E authority lane completes; rerun only if head/covered
    evidence is genuinely invalidated.

Focused proof plan:

```sh
pnpm --filter @interdomestik/web test:unit --run \
  src/components/claims/claim-draft-intake/claim-draft-intake.test.tsx \
  src/components/claims/claim-draft-intake/saved-draft-submit.test.tsx \
  src/components/claims/claim-draft-intake/saved-draft-reentry.test.tsx
pnpm i18n:check
pnpm i18n:purity:check
node scripts/repo-size-budget-sync.mjs --check
```

The affected browser canary uses a task-owned `PW_PORT` from the start and the unchanged
`gate-ks-sq` collector through the governed heavy-job controller. Git identity and dependency
links must be proven before heavy work. Mac `pr:review-ready`/heavy wrappers and Mac Docker are
forbidden. One full exact-head CI E2E remains the sole broad E2E authority lane.

## Highest-risk cases

1. **Deletion semantics overclaim:** wording could imply the case is immortal or that draft
   deletion is already performed. Exact assertions and reviewer semantic review must keep the
   claim limited to the effect of later source-draft edit/delete on this submitted case.
2. **Origin collapse:** editing one shared string could erase fresh-versus-existing distinction.
   Exact paired assertions preserve both openers.
3. **Translation drift:** one locale could say deleting the case, withdrawing it, or deleting
   both records. Arben's exact-hash approval plus reviewer parity disposition are mandatory.
4. **Layout/accessible verbosity:** longer copy could clip or become hard to scan. Existing
   mobile/current-locale browser collector and required exact-head E2E own regression proof;
   any observed layout problem stops rather than authorizing component/CSS expansion.
5. **False runtime inference:** the text is backed by B1's existing record independence, not a
   new source linkage, foreign key, retention policy or delete transaction. Any source evidence
   contradicting that baseline stops the gate.
6. **Unrelated locale churn:** JSON files contain broad claims copy. Diff and exact-key tests must
   prove only the two approved values per locale changed.

## Reviewer and evidence lifecycle

- Design: one bounded Opus 5 senior review completed read/grep-only in 297.129 seconds with
  `CONDITIONAL_PASS`. It verified the deletion statement against the exact owner-scoped draft
  delete, independent claim identity/copied facts, reachable post-submit delete affordance,
  sole runtime consumer and unchanged dynamic E2E locale imports. Four findings are consolidated
  once here: explicit Serbian noun reference, idiomatic Albanian negative coordination, honest
  single-test RED ownership and explicit supersession of B5's frozen localized values. No
  Gemini/model maintenance, second model route or further review round is required if this exact
  scope remains unchanged.
- Implementation: one writer, one independent bounded senior reviewer. One finding set permits
  at most one consolidated remediation pass and one substantive re-review only if code/tests/
  contract change materially. Further defects stop `fix-first`.
- GitHub: request Copilot once on the product PR; unavailable is recorded as unavailable, not
  pass. Monitor Sonar, CodeQL, security, feedback, finalizer and all threads on current head.
- Evidence order: RED/GREEN focused proof, exact-environment canary, early feedback, then one
  full exact-head CI E2E. Cancel stale heads and rerun only invalidated evidence.
- No old-head result can authorize a changed head.

## Publication, rollout and rollback

Before runtime:

1. exact-approve this immutable candidate;
2. create one clean task-owned docs-only authority worktree from then-current clean main;
3. materialize the byte-identical gate plus minimal current-program/current-tracker
   supersession and passing admission/UI-UX receipts;
4. run only focused Tier 0 authority proof, reviewer/feedback checks and merge exact head;
5. publish through governed task publication only, without direct refresh or fabricated
   product milestone;
6. require Brain=current, Integrity=clear, zero contradictions, M1-M7 verified and exact
   AI OS/resolver agreement on this slice with runtime not authorized;
7. create an immutable exact-main runtime receipt and stop for separate exact approval.

After runtime approval, rollout is one normal web product PR with no feature flag, schema,
backfill, provider or deployment mutation. Automatic CD must be contained before effects.

Rollback before product merge is deletion of only task-owned branch/worktree. After product
merge, rollback is one exact product-merge revert, triggered by misleading deletion semantics,
locale disagreement, origin collapse, accessibility/layout regression, unauthorized path drift
or failed current-head evidence. No schema/data/provider rollback exists. Claims and drafts
created under earlier authority are never deleted or rewritten as rollback.

## Non-goals and forbidden surfaces

- No new draft delete action, confirmation, warning modal or manager-list behavior.
- No claim-created badge, source/origin badge, draft-to-claim search or broad provenance UI.
- No change to draft/claim retention, ownership, deletion, lifecycle or audit behavior.
- No component, hook, action, reader, writer, route, query, navigation or state-machine change.
- No per-cause disabled-state expansion, Submit eligibility, Secure Save behavior or recovery.
- No anonymous/inactive/member tree expansion, Hero redesign or membership dashboard.
- No `apps/web/src/proxy.ts`, canonical route, auth/session/OTP, tenancy, schema/RLS/migration,
  billing/Paddle, provider, deployment, production, AI runtime or protected-surface mutation.
- No docs, CI, tracker cleanup, architecture cleanup or prerequisite promoted as product work.
- No AI OS/Brain/retrieval/KG/Atlas/persona/schema/dashboard/agent-count/workflow improvement.
- No Gemini maintenance/deletion, no second writer and no second slice.

## Stop conditions

Stop and return for fresh authority if:

- exact approved artifact/base/slice/writer map mismatches;
- Brain/Integrity/contradiction/M1-M7 checks fail or AI OS/resolver disagree;
- final locale wording changes after exact approval;
- the current source no longer proves draft deletion leaves the submitted case independent;
- any component/action/reader/writer/route/auth/tenancy/schema/RLS/billing/provider/CI/workflow/
  deployment file must change;
- a new locale key, test file, E2E writer or seventh path is required;
- the sole test writer exceeds 150 lines or an existing read-only origin assertion is weakened;
- copy needs a warning modal, delete control, source badge, claim retention rule or second outcome;
- layout, accessibility or localization is misleading and cannot be fixed inside the four locale
  values without changing the approved meaning;
- a new state, persistence, shared consumer, special environment or independently invalidatable
  proof surface appears;
- reviewer, security, CI, Sonar, CodeQL, feedback or finalizer evidence is non-green/unresolved;
- final product head changes after the sole full E2E lane;
- PR-ready status is not credible within 2-4 active engineering hours;
- one consolidated remediation pass is exhausted and a real defect remains;
- a second slice or successor promotion appears.

## Residual risks

- The saved-draft manager list still has no claim-created badge before resume. B4 restores the
  existing case only after the owner resumes the draft; broader provenance remains unpromoted.
- Copy can explain independence but cannot prevent a user from intentionally deleting the draft;
  existing delete confirmation and owner-scoped behavior remain separate.
- Public benchmarks do not expose the exact authenticated insurer draft-deletion seam. They
  support lifecycle separation only; repo behavior and tests own factual authority.
- Four long single-line JSON values remain legacy locale structure. This slice changes values
  only and does not refactor serialization.
- Brain shortened orientation to one useful locator query but did not select the slice. Final
  `humanUseful` and `brainAuthorityCorrect` are recorded factually at closeout; no ROI percentage
  is claimed from this measurement alone.

## Exact approval boundary

After the bounded senior review and one consolidated disposition, count this exact artifact with
`wc -c` and `shasum -a 256`. Approval must name exactly
`IDA-DG35-UI03a2-B7-SAVED-DRAFT-DELETE-INDEPENDENCE-TRUTH`, its exact UTF-8 byte count and
exact SHA-256. Any later byte change invalidates approval. Approval authorizes only docs-only
authority materialization; it never substitutes for the later exact-main runtime approval.
