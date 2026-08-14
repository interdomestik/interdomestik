---
document_id: IDA-DG38-UI03a2-B9-INCOMPLETE-SAVED-DRAFT-SUBMIT-TRUTH
date: 2026-08-14
status: reviewed_candidate_not_approved
authority: advisory_until_exact_hash_approval_and_docs_only_canonical_merge
base_sha: 18c24300707f027833a620067e2d8c2a3be962e5
resolver_before_gate: blocked_requires_current_authority
active_slice_before_gate: null
proposed_slice: IDA-UI03a2-B9-INCOMPLETE-SAVED-DRAFT-SUBMIT-TRUTH
risk_tier: 2
runtime_authorized: false
product_mutation_authorized: false
deployment_authorized: false
production_authorized: false
r2_observation_target: 2/3
---

# IDA-DG38 — UI03a2-B9 incomplete saved-draft Submit truth

## Decision and authority boundary

Propose exactly one future Tier 2 product/copy/i18n/accessibility micro-slice:
`IDA-UI03a2-B9-INCOMPLETE-SAVED-DRAFT-SUBMIT-TRUTH`.

One outcome only: when a verified owner re-enters a valid persisted vehicle/property draft
at preview with at least one required fact missing, no submitted case has been found and the
inactive-member manager-only branch is not active, the disabled Submit control explains that
the required facts must be completed and the draft saved before submission. It preserves the
truth that active membership is also required and saving does not submit a claim.

This artifact is not repository authority. It grants no product branch, worktree, active
execution, Brain product session, runtime, database, provider, deployment or production
authority. Arben must approve the exact document ID, UTF-8 byte count and SHA-256 before a
byte-identical docs-only authority PR may materialize it. Gate approval is not runtime
approval. Product code remains prohibited until the gate has merged, governed publication and
checks agree, the resolver selects only B9 with `runtime_authorized:false`, and a separate
exact-main runtime receipt is exact-hash approved.

## Verified checkpoint and fail-closed context

Read-only evidence observed 2026-08-14:

- local `main`, `origin/main` and protected GitHub `main` are identical at
  `18c24300707f027833a620067e2d8c2a3be962e5`; ahead/behind is `0/0` and the tree is clean;
- only the canonical main worktree exists; there is no local or remote `codex/*` branch, Git
  lock, product writer, product build/E2E process or open product PR;
- open PRs `#1553`, `#1552` and `#1508` are Dependabot maintenance and are not product slices;
- one unattached `archive/verification-evidence-policy-20260807-187b26c9` branch is a preserved
  maintenance archive with no worktree/upstream and is not a writer;
- preflight and branch hygiene pass; branch-hygiene evidence SHA-256 is
  `788e3a6b52a57ebe834134ce738aa21ee06aef2582a0d2cb9cc4f8ef8fa652a4`;
- the resolver returns `blocked_requires_current_authority`, reason
  `umbrella_without_concrete_promoted_slice`, `activeSlice=null`; the workflow scorecard blocks
  only on absent promotion/gate/runtime;
- current-program/current-tracker Rev 226 consumed CI01, promotes no successor and records R2
  observation 1/3 from evidence-reuse activation and first representative merge PR `#1550` /
  `5feca76ad508301291b1e138c4d228b14b1513b0`; that PR changed no product behavior;
- GitHub main health for this base is green for Secret Scan, CodeQL and Sonar. Automatic CD run
  `31774865168` remains pending with `jobs:[]`; no checkout or provider/deployment step is
  evidenced and this gate does not mutate it;
- check-first AI OS observation
  `5300f9ef6c72f053ef05332aad3d611a12c0d774d11476f23b2ab4db2b556e7d`
  reports Interdomestik repo authority current at this exact main, but Brain is stale and
  Integrity is drifted because published inputs differ. No direct refresh, controller edit,
  runtime repair or fabricated milestone was performed;
- active-execution status is unavailable/advisory-only under that fail-closed control state;
  the prior Brain product session is terminal, not active.

The AI OS state does not promote B9. It is a blocker to product runtime, not permission to
repair global state from this product task. Canonical repo evidence may support this reviewed
design candidate while all mutation stays stopped at the exact approval hold.

The root checkout has a user-controlled skip-worktree `.codex/config.toml` that is 902 bytes
larger than its HEAD blob. It is preserved. Root repo-size output is therefore invalid for this
candidate; any future size check/sync must run only in the fresh task worktree whose config is
the exact HEAD blob.

## Repository-supported selection

B1-B8 already established canonical saved-draft submit, post-submit/source independence,
pre-submit prerequisites, existing-case restoration, origin-specific success truth, dirty-only
truth, delete independence and inactive-membership truth. Rev 223 consumed B8 and required a
fresh design selection. B8 records two remaining product candidates: active incomplete or
malformed drafts still receive the generic combined explanation, while a pre-resume claim badge
requires a wider provenance/read contract.

Current source proves one bounded cause-collapse:

- `DormantPreview` already receives the owner-scoped saved-draft ID/version and five required
  facts, and already distinguishes manager-only and complete-dirty causes;
- the disabled-state matrix explicitly maps `incomplete` to generic `submitExplanation`;
- persisted payload validation permits optional facts and stores `resumeStep='preview'`, while
  resume restores that step verbatim. Normal forward navigation blocks an incomplete preview,
  so this is a real defensive re-entry state, not a common fresh-flow claim;
- background existing-claim lookup still runs for every valid saved identity and must remain
  higher priority than any disabled explanation;
- no new read, write, state, route or authority input is required.

### Bounded candidate audit

| Candidate | Value | Scope/risk | Decision |
| --- | --- | --- | --- |
| Incomplete persisted-draft Submit truth | Names the exact completion/save action in a real defensive owner re-entry state | Existing selector + 4 locales; Tier 2 | Select |
| First-secure-save cause truth | More common, but B3 already states the saved-draft prerequisite and it needs a distinct future cause decision | Same seam; independent outcome | Defer |
| Malformed/missing identity recovery | Diagnoses exceptional identity failure | Recovery/error contract, not ordinary copy | Defer |
| Pre-resume submitted-case badge | Shows linkage earlier | Batch owner/tenant projection or provenance contract; Tier 3 | Defer |
| Hero or membership dashboard redesign | Broad IA/visual phase | Multi-component program | Exclude |

B9 is smaller than the provenance badge, adds no architectural surface and has one direct
behavioral outcome. It does not promote B10, the badge, Hero, dashboard redesign or any second
journey node.

## Risk and exact outcome

**Tier 2 — product-facing copy/i18n/accessibility; no protected runtime mutation.**

Entry conditions are all required:

1. an exact persisted draft ID passes the existing UUID predicate and its version is present;
2. the owner has resumed the saved vehicle/property draft at existing preview;
3. at least one of issue type, incident date, counterparty, desired outcome or summary is blank;
4. `managerOnly` is false, so the existing inactive-membership explanation does not own the
   state;
5. no deterministic existing claim has been returned by background lookup.

The single transition is presentation-only: the existing explanation selector chooses one new
required `submitIncompleteExplanation` value before the generic fallback. Cause precedence is:

`found claim > manager-only membership > persisted incomplete > complete dirty > generic`.

Exit conditions:

- Submit remains disabled, inert, outside a form and bound to the same `aria-describedby`;
- no claim/draft action, request, route, navigation, focus move, event, audit, notification,
  membership or persistence mutation is added;
- completing and saving through existing controls may later make the current eligibility path
  true, but B9 does not change those controls or eligibility;
- if lookup returns a valid existing claim, B4/B5/B7 canonical link and existing-case truth
  replace the disabled state;
- not-persisted, missing-version and malformed-id states keep generic B3 copy; complete-dirty
  keeps B6 copy; manager-only keeps B8 copy.

## Frozen localized contract

Add exactly one required key inside the existing serialized `claims.draftIntakeCopy` object:
`submitIncompleteExplanation`.

- EN: `Complete the required draft facts, then save the draft before submitting. Active membership is still required, and saving does not submit the claim.`
- SQ: `Plotësoni faktet e kërkuara të skicës, pastaj ruajeni skicën para dorëzimit. Anëtarësimi aktiv kërkohet ende dhe ruajtja nuk e dorëzon kërkesën.`
- MK: `Пополнете ги потребните факти во нацртот, потоа зачувајте го нацртот пред поднесување. Сè уште е потребно активно членство, а зачувувањето не го поднесува барањето.`
- SR: `Popunite obavezne činjenice u nacrtu, zatim sačuvajte nacrt pre podnošenja. Aktivno članstvo je i dalje potrebno, a čuvanje ne podnosi zahtev.`

The copy names completion, save-before-submit, membership and save/submit separation without
claiming that save activates membership, that membership alone is sufficient, that the draft
is a claim, or that coverage/review/payment begins.

## Exact frozen writer map

Production/i18n, exactly five:

1. `apps/web/src/components/claims/claim-draft-intake/dormant-preview.tsx`
2. `apps/web/src/messages/en/claims.json`
3. `apps/web/src/messages/sq/claims.json`
4. `apps/web/src/messages/mk/claims.json`
5. `apps/web/src/messages/sr/claims.json`

Focused existing tests, exactly three:

6. `apps/web/src/components/claims/claim-draft-intake/claim-draft-intake.test.tsx`
7. `apps/web/src/components/claims/claim-draft-intake/saved-draft-submit.test.tsx`
8. `apps/web/src/components/claims/claim-draft-intake/saved-draft-reentry.test.tsx`

Conditional deterministic metadata only if the unchanged tracked-only generator proves drift
inside the fresh worktree:

9. `scripts/repo-size-budget.json`

No file may be added, deleted or renamed. Any ninth non-metadata writer or protected path stops
implementation. Read-only consumers include `index.tsx`, `main-panel.tsx`,
`use-saved-draft-claim.ts`, `claim-draft-intake.boundary.test.ts`,
`apps/web/e2e/gate/member-claim-draft-intake.spec.ts`,
`apps/web/e2e/smoke/ida-dashboard-smoke.spec.ts`, the server entry, save lifecycle, validators,
actions and owner/tenant persistence paths.

## Line-ceiling plan

Exact base counts are `dormant-preview.tsx` 149, `claim-draft-intake.test.tsx` 150,
`saved-draft-submit.test.tsx` 144 and `saved-draft-reentry.test.tsx` 141 lines.

- `dormant-preview.tsx` must finish at or below 149. Repack only its existing local selector
  signature/blank space while adding the cause; do not extract a helper or touch its boundary
  test.
- `claim-draft-intake.test.tsx` must remain exactly at or below 150 by replacing/expanding the
  existing one-line locale collector in place.
- The two remaining tests must stay at or below 150 through replacement or compact existing
  rows, not duplicated suites.
- If Prettier or the exact behavior cannot fit these limits, stop. No refactor/split is silently
  admitted by this gate.

## Contract graph and closure

Nodes:

- `N1 entry`: existing owner-scoped persisted-draft re-entry and preview restoration;
- `N2 identity`: existing UUID/version predicate;
- `N3 facts`: five existing required facts;
- `N4 selector`: existing local Submit explanation selector; sole component writer;
- `N5 locales`: four serialized claim-copy stores;
- `N6 found-case`: existing deterministic owner/tenant lookup and canonical success link;
- `N7 tests`: three focused existing unit/locale collectors;
- `N8 baseline`: B3 generic, B6 dirty and B8 membership truth plus disabled ARIA contract.

Edges:

- `E1 N1 -> N2`: supply existing saved identity/version;
- `E2 N1 -> N3`: restore existing persisted facts and preview step;
- `E3 N2/N3 -> N4`: select incomplete only for valid identity with a missing fact;
- `E4 N5 -> N4`: parse/render the required localized key;
- `E5 N6 -> N4`: found claim overrides every disabled explanation;
- `E6 N4 -> N8`: retain membership, dirty and generic precedence;
- `E7 N7 -> N2/N3/N4/N5/N6`: bind cause matrix, locale exactness and found-case override.

Closure is explicit:

- callers: all `DormantPreview` callers and the `ClaimDraftCopy` parse path are enumerated;
- shared consumers: only the current intake graph consumes the serialized type; all four
  locale instances and every typed fixture change atomically;
- read/write/delete: static copy selection only; no runtime store operation changes;
- mount/error paths: invalid identity, incomplete persisted, dirty complete, manager-only,
  lookup error/absent/found, eligible and submit outcomes are accounted;
- capability: ordinary focused unit/i18n checks plus unchanged governed CI/browser regression;
  no special provider/database environment is needed for the new branch;
- test collectors: existing matrix, re-entry/found-case test and exact four-locale collector own
  the changed edges;
- baseline ownership: B3 owns generic, B6 owns dirty, B8 owns membership, B4/B5/B7 own found
  claim, and B9 owns only persisted-incomplete selection.

## TDD and acceptance evidence

First action after separate runtime approval: change only the existing `incomplete` row in
`saved-draft-submit.test.tsx` to expect `submitIncompleteExplanation`, extend its fixture, run
that file and retain the single expected RED before production/i18n edits.

Focused GREEN must prove:

1. valid UUID/version plus each missing required fact selects the new value and keeps Submit
   disabled/inert with `aria-describedby="claim-draft-submit-explanation"` and the exact
   accessible description;
2. incomplete plus unsaved changes still selects completion/save truth;
3. manager-only plus incomplete keeps membership truth;
4. not-persisted, missing-version and malformed-id remain generic;
5. complete dirty remains unsaved truth; complete persisted clean remains eligible;
6. found existing claim, including an incomplete saved draft, replaces the explanation with
   existing-case truth and canonical link;
7. all four production locale objects parse, contain non-empty exact values and preserve every
   existing key/value outside the new key;
8. component/test line ceilings, exact diff and repository-size contracts pass.

Focused commands:

```sh
pnpm --filter @interdomestik/web test:unit --run \
  src/components/claims/claim-draft-intake/claim-draft-intake.test.tsx \
  src/components/claims/claim-draft-intake/saved-draft-submit.test.tsx \
  src/components/claims/claim-draft-intake/saved-draft-reentry.test.tsx \
  src/components/claims/claim-draft-intake/claim-draft-intake.boundary.test.ts
pnpm i18n:check
pnpm i18n:purity:check
pnpm check:modularity-guard
pnpm check:e2e-contracts
node scripts/repo-size-budget-sync.mjs --check
pnpm security:guard
```

The new defensive state is owned by deterministic accessible component tests; constructing it
through a new browser/DB fixture would widen the slice. Existing member and inactive-manager
browser collectors stay read-only and must remain green. The implementation PR must complete
exactly one full exact-head CI E2E authority lane; skip is failure. Required final evidence on
the same reviewed head remains `pnpm pr:verify`, `pnpm security:guard`, `pnpm e2e:gate`, CI,
Sonar with every new issue classified, CodeQL, Semgrep, OSV, gitleaks, pnpm audit, feedback
intake, finalizer and zero unresolved threads. Heavy/composite/browser proof runs through the
governed Z620 path; Mac remains control plane/light writer and Mac Docker stays unused.

## Highest-risk cases

1. incomplete is selected for invalid/missing identity or normal first save;
2. membership or dirty precedence regresses;
3. a late found claim leaves contradictory disabled copy visible;
4. a locale omits the nested serialized key or changes claim/draft meaning;
5. wording implies save submits, activates membership, establishes coverage or starts review;
6. near-ceiling files grow or an unlisted helper/test appears;
7. root skip-worktree config contaminates repository-size evidence;
8. a product head changes after senior review or the sole full E2E authority run;
9. automatic CD reaches checkout/provider/deploy effects before containment.

## UI/UX benchmark and measurable target

Contemporaneous public official evidence uses principles only:

1. GOV.UK `Check a service is suitable` says an ineligible user should be told why and, where
   possible, what to do instead;
2. GOV.UK `Recover from validation errors` says missing required information should identify
   what is wrong and how to fix it, while eligibility is not mislabeled as field validation;
3. Progressive's online claim guidance separates required incident facts, eligibility limits,
   filing confirmation and later tracking;
4. GEICO's online claim guidance distinguishes information collection, completed reporting and
   later claim management, with explicit coverage qualification.

Comparison criteria: cause specificity, next valid action, preservation of entered work,
save-versus-submit truth and accessible association with the disabled action.

Better-than-baseline target: persisted-incomplete disabled states with a specific completion
and save instruction rise from `0/1` to `1/1`, measured by the focused cause matrix, exact
four-locale collector and accessible-description assertion. Use no operator wording, layout,
branding, interaction sequence, imagery or distinctive trade dress.

## Security, privacy, accessibility and performance

- The server-owned owner/tenant boundary and saved identity remain unchanged; no foreign draft
  or claim existence is exposed.
- No route, proxy, auth/session/OTP, role, tenant, membership resolver, schema/RLS, action,
  reader, writer, billing, provider or deployment surface changes.
- No PII, narrative, identifier, membership detail or error payload enters copy, logging,
  analytics or reviewer packets.
- The disabled button, `aria-describedby`, visible explanation, keyboard behavior, focus and
  found-case link remain unchanged. The four strings must wrap within existing mobile/zoom/text
  spacing baselines; no new visual component or layout claim is made.
- Runtime cost is one local Boolean/string selection: no network, DB, dependency, bundle or
  concurrency expansion.

## Review, execution and R2 measurement

Before exact approval, one bounded read-only senior design review must inspect the entire gate,
current selector, validation/re-entry reachability, writer map, line ceilings, copy semantics and
acceptance matrix. Claude Opus 5 is first when actually available; one process receives one
30-minute timer and is never resent merely to extend a wait. A blocked route is not approval;
the authorized fallback is GPT-5.6 Sol Ultra. One finding set may be consolidated once without
adding a second outcome.

After runtime approval, use one fresh worktree and one writer. One bounded implementation review
uses the exact current diff and relevant wiring. Substantive remediation gets one consolidated
pass and one current-diff re-review. Request Copilot once after the PR opens; classify absence
honestly. Do not create open-ended reviewer loops.

If merged, this is eligible as R2 observation 2/3—and the first product mutation observed under
reuse—only when it remains product-representative, has one successful full exact-head PR E2E and
an evaluable exact-main resolver. Record exact PR,
head, merge, PR E2E run/attempt/runner and workflow duration/test counts, exact-tree resolver
outcome/reason/duration, main E2E setup/DB/RLS and reuse decision, browser compute avoided, whole
CI/critical path, failures/reruns/retries/quarantine, reviewer/CI latency, wall/active time,
review findings/remediation count, `humanUseful` and `brainAuthorityCorrect`. At 2/3 make no
general ROI, final keep/revert or threshold-change claim.

## Rollout, rollback, exclusions and stop conditions

Before implementation: exact approval, byte-identical docs-only merge, governed publication,
Brain/current-integrity check, resolver selection and separate runtime approval are mandatory.
No feature flag, migration, backfill or provider action exists. Automatic CD must be contained
before checkout or deploy effects.

Rollback before merge removes only the exact task-owned branch/worktree after clean identity
proof. After merge, revert only the product merge if cause precedence, locale meaning,
accessibility, layout, protected boundaries or exact-head evidence is wrong. No data/provider
rollback is needed because no persistent state changes.

Explicit exclusions:

- no eligibility, Save/Save changes, Submit, lookup, claim/draft lifecycle or persistence change;
- no malformed-id recovery, first-save branch, badge, origin/source projection or search;
- no anonymous/inactive/member entry-tree expansion, Hero or membership-dashboard redesign;
- no route or `apps/web/src/proxy.ts`, auth/session/OTP, tenancy, schema/RLS/migration,
  billing/Paddle, notification, analytics, provider, CI/workflow, deployment or production;
- no docs/README/AGENTS/architecture/AI OS/Brain/skill change as the product outcome;
- no M6/M7 cohort fabrication, Atlas enrollment, second writer or second slice.

Stop for any authority/hash/base mismatch; stale or contradictory runtime authority; need for
an unlisted writer; inability to keep exact line ceilings; inability to prove the state from
current validation/re-entry contracts; misleading locale semantics; protected-surface need;
second outcome; non-green focused/current-head evidence; actionable unresolved feedback; head
change after the sole full E2E; or failure to reach PR-ready state within the bounded micro-slice
budget. Preserve the last valid checkpoint and rerun only invalidated evidence.

## Exact approval boundary

After the bounded senior review and one consolidated disposition, compute exact UTF-8 bytes and
SHA-256. Approval must name this exact `document_id`, byte count and hash. It authorizes only
byte-identical docs-only authority materialization; it never authorizes product runtime.
