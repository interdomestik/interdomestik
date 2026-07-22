# IDA-CW01 closeout — ClaimWizard retirement and legacy claim contract cleanup

## Outcome

`IDA-CW01` is complete. The two production-orphaned ClaimWizard trees, their direct
unit tests and the obsolete executable submission-dependent E2E/pilot contracts are
removed. The existing Claim Draft Intake remains submission-dormant, and the
canonical claim actions, domain writers, upload/provider/event/notification
surfaces and every protected architecture boundary remain unchanged.

No replacement submission UI, claim writer or successor was introduced. The
remaining member onboarding contract reaches the dormant intake through visible UI
navigation and verifies the primary dashboard action's exact state-dependent href;
it does not bypass the product route with a direct test navigation.

## Authority and merge

- Design gate `IDA-DG21`: 22,079 UTF-8 bytes, SHA-256
  `c84734f482f73682c1f7123ac3cef8e8b58057615ef8d189a4ac7b401e550736`.
- Exact runtime-authority request: 22,024 UTF-8 bytes, SHA-256
  `44ad2c2d41ab06901369612e854b0310b9de8a33258bd9606575294c22f5eeae`.
- Exact runtime implementation base:
  `48c7704b46ace6d1ca8ba489e536ae395df26469`.
- Accepted live-lifecycle disposition: 11,768 UTF-8 bytes, SHA-256
  `ef565d2b313d319364ab8a49bcfb02aac29dc99aafedf023e1650cdae2debf2b`.
- Implementation PR: [#1405](https://github.com/interdomestik/interdomestik/pull/1405).
- Final implementation head: `2030d7904d526948c9d8f004c40714c5697b0ea4`.
- Merge-main SHA: `8d41e82da30c91017d8121a8ae2388c660832b83`.
- Exact base-to-head diff digest: SHA-256
  `f5a93724983aaf53b71c5b65729d51c50a2719f0a67382e0605711cb318fb01d`.

The runtime authority is consumed. No replacement slice is promoted. After this
closeout the resolver must return `blocked_requires_current_authority` with
`activeSlice=null`.

## P00 and exact implementation shape

P00 passed before repository mutation. It proved the per-path importer closure for
all 12 deleted production files, no production consumer of either ClaimWizard,
zero dangling named Playwright config entries for every deleted spec and the
assertion-level disposition of `c1-04`, `c1-05` and `scenario-01`. Current claim
actions and domain writers stayed outside the deletion map and read-only.

The final implementation contains exactly 35 changed paths: 25 deletions, 10
modifications and zero new repository files, with 99 insertions and 4,522
deletions. The cumulative shape includes the accepted tenant-host lane count sync
and the separately accepted live-lifecycle disposition. Deterministic repository
size metadata was updated only by the unchanged generator.

The live lifecycle disposition removed
`apps/web/e2e/live/pilot-day1-lifecycle.spec.ts` because its sole deterministic
producer, `pilot-day1-drive.spec.ts`, was already in the accepted retirement map.
It also removed exactly that consumer's host-lane row, changed the inventory
expectation from 13 to 12 and tightened the size budget by the exact deleted bytes.
No replacement producer, seeded/manual-data dependency or claim writer was added.

## Preserved contracts and protected boundaries

The current Claim Draft Intake remains intact and submission-dormant. Its page-ready
marker and intake assertions survive. In the retained onboarding contract, the
member dashboard's hero action is clicked and verified against its exact visible,
state-dependent href. The seeded KS member correctly lands on the active-claim
detail route; the test then uses the visible Claims navigation and visible create
claim affordance to reach `/member/claims/new`, awaits `new-claim-page-ready` and
retains the intake assertions. No direct `gotoApp` bypass or fixed false assumption
about the hero destination remains.

`apps/web/src/proxy.ts`, canonical routes, auth/session/shared-auth, tenancy,
schema/migrations/RLS, `apps/web/src/actions/claims.core.ts`,
`apps/web/src/actions/claims/submit.core.ts`, claim create/submit actions,
`packages/domain-claims/**`, draft persistence, uploads/documents, providers,
events, notifications, billing/Paddle, AI and deployment behavior did not change.
There was no database or provider contact and no dependency or workflow mutation.

## Verification and review disposition

- P00 importer/config/contract-loss proof: PASS.
- Focused tenant-host contract: 5/5 PASS; live inventory: 12 projects / 12 files.
- Deterministic repository-size check: PASS.
- `pnpm security:guard`: PASS with zero claim-writer additions.
- Playwright listing: 1,691 tests across 146 files with zero retired-spec hits.
- Focused real member-navigation receipts: retained 6/6 PASS; independent
  revalidation 4/4 PASS.
- `pnpm pr:verify:hosts`: PASS, including 353/353 CI contracts, 85.60% coverage,
  209 E2E passes with 9 expected skips and 13 smoke passes with 11 expected skips.
- `pnpm e2e:gate`: PASS, 209 passed with 9 expected skips.
- Exact current-head PR CI, full E2E, Pilot Gate, SonarCloud, CodeQL, Secret Scan,
  pnpm audit, Semgrep, OSV, deterministic backstops and `pr-finalizer` passed.

Opus 4.8 returned architecture, contracts/security and overall PASS on the final
live-lifecycle delta with no blocking or material finding. The exact reviewer
receipt is `tmp/reviewer-routes/20260722T213746-opus.json`.

The bounded Codex Security diff scan reviewed all three deterministic rows in its
declared current delta and found zero candidates/findings. Its sealed 6,042-byte
report hashes to
`92632c29f86fe499e0d5038547a772b23facd103382caff47c2d3fef79681585`.
GitHub Codex's CTA and orphaned live-lifecycle P2 findings were both resolved with
exact current-head proof; all review threads were resolved before merge.

## Deployment and exact-main health

Automatic CD run `29961496696` was cancelled immediately after merge. The only
started build job stopped during Docker Buildx setup. Registry login, image
metadata, image build/attestation, staging deployment/E2E, production evidence,
production build/deploy and production verification did not run. No deployment or
alias change occurred.

Post-merge `main@8d41e82d` Secret Scan `29961496638` and CodeQL runs
`29961495615` / `29961495696` passed. Sonar Main Gate `29961496726` is NON-PASS
only because the external SonarCloud check reports the pre-existing rolling-window
issue `AZ-ACoVO5G2i53uX0BTV` / `githubactions:S8544` at untouched
`.github/workflows/pr-deterministic-backstops.yml:88`, created on 2026-06-30.
The implementation and closeout do not modify that workflow. Main CI
`29961496730` passed validation, audit, static, coverage/unit, AI-eval, RLS and the
full E2E gate. The exact merge main is healthy with that one classified,
non-attributable Sonar rolling-window exception.

## Brain measurement and closeout honesty

Brain and Obsidian were advisory only. The Brain active-execution record correctly
identified task `IDA-CLAIMWIZARD-RETIREMENT-DISCOVERY-2026-07-21`, visible thread
`019f8576-faea-7223-8bf5-34c861590a7b`, slice `IDA-CW01` and worktree
`2355/interdomestik-crystal-home`, but its TTL expired before closeout and status was
`stale`. Repository authority, exact owner receipts, source, tests, reviews and CI
governed the work. No Brain usefulness, token/time saving, cost, ROI or quality
improvement claim is made; `humanUseful` remains `awaiting Arben`.

## Closeout and next action

The canonical program and tracker consume the sole `IDA-CW01` promotion. Runtime
and deployment authority are closed. `IDA-UI03a2-P0a1a1b`, P0a2, frozen P0,
parent UI03a2, Authority Sync / AI OS adapter correction, CD/Staging stabilization,
remaining UI/product slices, runtime AI, Eval v2 and every other successor remain
blocked or unpromoted here. No successor is started or promoted by this closeout.
A fresh current-authority/design gate and separate exact authority are required
before any follow-on implementation. Expected resolver state is
`blocked_requires_current_authority`, `activeSlice=null`.
