---
document_id: IDA-DG39-UI03a2-B10-FIRST-SECURE-SAVE-SUBMIT-TRUTH
date: 2026-08-14
status: reviewed_candidate_pending_exact_arben_approval
authority: advisory_until_exact_hash_approval_and_docs_only_canonical_merge
base_sha: 9dc5642f2b7be849628d0b8b258edfd7fefd0403
resolver_before_gate: blocked_requires_current_authority
active_slice_before_gate: null
proposed_slice: IDA-UI03a2-B10-FIRST-SECURE-SAVE-SUBMIT-TRUTH
risk_tier: 2
runtime_authorized: false
product_mutation_authorized: false
deployment_authorized: false
production_authorized: false
r2_observation_target: 2/3
---

# IDA-DG39 — B10 first secure-save Submit truth

## Decision

Propose exactly one Tier 2 product/copy/i18n/accessibility micro-slice:
`IDA-UI03a2-B10-FIRST-SECURE-SAVE-SUBMIT-TRUTH`.

The one user-visible outcome is precise. When an access-active member reaches
preview with all five required facts complete but no active saved-draft identity
or version yet, the disabled Submit control tells them to save this complete
draft first, while retaining the facts that active membership is required and
saving does not submit a claim. Submit remains disabled and inert.

This is a design candidate only. It grants no branch, worktree, product session,
runtime, save/submit change, database, deployment or production authority. Only
an exact Arben approval of this immutable file, followed by a byte-identical
docs-only authority merge, can promote B10. A separate exact-main runtime receipt
and approval would still be required before code.

## Checkpoint and selection

On 2026-08-14, `node tools/ai-os-state.mjs --check --json` passed with
observation `269c08f8b7c85205f9d12b3c8415501520bf30e497b6c818be639e3e8657bab2`:
Brain is `current`, Integrity is `clear`, control revision is 253, M1 is current,
and no M4–M7 candidate or cohort is fabricated. Interdomestik `main` and
`origin/main` are clean and identical at
`9dc5642f2b7be849628d0b8b258edfd7fefd0403`. Preflight and branch hygiene pass;
there is one main worktree, no active product writer and no promoted product PR.
The canonical resolver and scorecard both correctly return
`blocked_requires_current_authority`, `activeSlice=null`.

Rev 229 has consumed B9. Its canonical candidate audit leaves four distinct
possibilities: first secure-save cause truth, malformed/missing identity recovery,
pre-resume claim badge, and broad Hero/dashboard work. The first is the only
ordinary active-member path that can be selected with the existing preview
selector and without a new read, write, persistence or provenance contract.

| Candidate | User value | Scope/risk | Decision |
| --- | --- | --- | --- |
| First secure-save Submit truth | Names the immediate next action on the ordinary complete-but-never-saved path | Existing selector, four locales, focused tests; Tier 2 | Select |
| Malformed/missing identity recovery | Could explain an exceptional broken identity | Recovery/error semantics | Defer |
| Pre-resume submitted-case badge | Could show case linkage earlier | Owner/tenant provenance read; Tier 3 | Defer |
| Hero or membership dashboard redesign | Broad visual and IA work | Multi-component program | Exclude |

## Verified seam and cause boundary

`DormantPreview` is the sole selector surface. It currently derives `persisted`
from the existing UUID and positive/truthy version, derives `incomplete` only for
persisted data, and sends all remaining disabled states to generic B3 copy. The
route passes `lifecycle.active?.id` and `.version` through unchanged read-only
conduits. A complete new draft therefore has neither active identity nor version
and currently receives a generic prerequisite list despite having one immediate
next action: its first secure save.

B10 may recognize only this exact state:

1. `managerOnly=false` (access-active member); 
2. all five required facts are nonblank;
3. both active draft id and active draft version are absent (`null` or `undefined`);
4. no existing saved identity is claimed valid.

The predicate is deliberately not a recovery classifier. A valid id with a missing
version, a malformed id, an incomplete fresh draft, an inactive manager-only draft,
a complete persisted dirty draft, and any existing-claim output retain their current
owners. The found-claim output remains higher priority because it replaces the
disabled control rather than relying on B10 copy.

Cause order after the addition is:

`found claim output > manager-only membership > persisted incomplete > complete persisted dirty > complete first secure save > generic`.

## Frozen product and copy contract

Add one `submitFirstSaveExplanation` entry to existing serialized
`claims.draftIntakeCopy` in all four locales, and select it only for the stated
complete/no-identity state.

| Locale | Frozen text |
| --- | --- |
| EN | `Save this complete draft first. Submitting also requires active membership. Saving the draft does not submit the claim.` |
| SQ | `Ruajeni së pari këtë skicë të plotë. Dorëzimi kërkon gjithashtu anëtarësim aktiv. Ruajtja e skicës nuk e dorëzon kërkesën.` |
| MK | `Прво зачувајте го овој целосен нацрт. За поднесување е потребно и активно членство. Зачувувањето на нацртот не го поднесува барањето.` |
| SR | `Prvo sačuvajte ovaj potpuni nacrt. Za podnošenje je potrebno i aktivno članstvo. Čuvanje nacrta ne podnosi zahtev.` |

The text must not say that saving creates a claim, makes a member active, begins
review, guarantees eligibility, repairs malformed identity, or changes the
existing secure-save operation.

## Frozen writer map

Exactly nine maximum paths:

1. `apps/web/src/components/claims/claim-draft-intake/dormant-preview.tsx`
2. `apps/web/src/messages/en/claims.json`
3. `apps/web/src/messages/sq/claims.json`
4. `apps/web/src/messages/mk/claims.json`
5. `apps/web/src/messages/sr/claims.json`
6. `apps/web/src/components/claims/claim-draft-intake/claim-draft-intake.test.tsx`
7. `apps/web/src/components/claims/claim-draft-intake/saved-draft-submit.test.tsx`
8. `apps/web/src/components/claims/claim-draft-intake/saved-draft-reentry.test.tsx`
9. `scripts/repo-size-budget.json` only if the deterministic tracked-only sync
   changes it in the fresh approved worktree.

No file may be added, deleted or renamed. The existing component is at the
150-line ceiling and must remain at or below it by compacting only its local
selector expression; no helper, refactor or new consumer is admitted. Each
existing test also remains at or below 150 lines by replacing rows/assertions in
place. `index.tsx`, `main-panel.tsx`, lifecycle hooks, save actions, claim lookup,
route entry, auth, membership, persistence and all E2E specs are read-only
consumers.

## Acceptance and TDD

The first implementation action after a separate runtime approval is one expected
RED: replace the `not persisted` matrix expectation in `saved-draft-submit.test.tsx`
with `submitFirstSaveExplanation`, add only that fixture key, and run the focused
file before production or locale edits.

Focused GREEN must prove all of the following:

1. a complete, access-active preview with both id/version absent selects the exact
   first-save text and keeps the button disabled, inert, outside a form and bound
   to `aria-describedby="claim-draft-submit-explanation"`;
2. null and undefined absent identity inputs have the same first-save behavior;
3. incomplete fresh drafts, valid-id/missing-version, malformed id, manager-only,
   persisted incomplete, persisted dirty, eligible and found-claim states retain
   their existing B3/B6/B8/B9/found-claim owners;
4. all four locale objects parse, contain exact nonempty text, preserve every
   other value, and retain accessible-description parity;
5. the component/test line ceilings, modularity, E2E contracts and deterministic
   repository-size contract pass.

Focused commands are the four existing claim-intake unit/boundary tests, then
`pnpm i18n:check`, `pnpm i18n:purity:check`, `pnpm check:modularity-guard`,
`pnpm check:e2e-contracts`, and `node scripts/repo-size-budget-sync.mjs --check`.
One governed exact-head PR E2E is required once after focused proof and review;
no local full browser rerun is authorized merely to duplicate it. Mandatory
merge gates remain `pnpm pr:verify`, `pnpm security:guard`, and `pnpm e2e:gate`.

## Risk, review, rollout and rollback

Highest risks are selecting first-save text for malformed/missing-version recovery,
regressing higher-priority membership/incomplete/dirty/found-claim behavior,
misstating save versus submit in any locale, or exceeding a frozen line ceiling.
The admission receipt binds these as independently invalidatable proof surfaces.

One bounded senior design review is required before the approval hold. Its reviewer
must inspect the full gate, exact selector/entry/lookup graph and all exclusions;
if it finds substantive issues, apply at most one consolidated candidate remediation
and one current-artifact re-review. No reviewer loop, code, runtime receipt or
product branch is authorized by this gate.

Rollback after a future product merge is one revert of that exact merge; no data
rollback exists because B10 changes only presentation selection and locale text.
Stop rather than expand if the exact first-save condition requires a new reader,
writer, route, membership rule, persistence behavior, E2E fixture, browser
environment or a tenth path.

## Explicit exclusions

No change to Save/Save changes/Submit actions, eligibility, claim lookup, draft or
claim persistence, recovery, malformed-id handling, identity/version repair,
pre-resume badge/provenance, routes or `apps/web/src/proxy.ts`, auth/session,
tenancy, membership resolution, schema/RLS, billing, analytics, CI/CD, deployment,
production, Hero/dashboard redesign, M6/M7, AI OS, Brain, skills, or a second slice.
