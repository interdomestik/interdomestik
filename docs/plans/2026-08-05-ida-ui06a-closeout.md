# IDA-UI06a Closeout — Public Header Overflow Containment

## Outcome

`IDA-UI06a` is complete. Corrective authority PR
[#1490](https://github.com/interdomestik/interdomestik/pull/1490) merged
`IDA-DG25-A1` R2 as `cec2054b3def047d601c81dd02fb5139aa530254`.
Implementation PR [#1494](https://github.com/interdomestik/interdomestik/pull/1494)
then squash-merged exact reviewed head
`e2969fe327413c52b64501cbe3296e494910374d` as main
`6c7bfe2ada5315b2ae5b4955754af9c74a16786a`.

The existing public header now contains its own brand, language and sign-in
actions across the approved stressed widths and locales. The locale disclosure
is anchored to the action group, retains ordinary keyboard order and Escape
behavior, and exposes root geometry only as diagnostic telemetry. This slice
does not redesign or shorten the Hero and does not claim that the remaining UI
journey tree is complete.

Classification: Tier 2 product UI/accessibility implementation. Runtime
authority `IDA-UI06a-RUNTIME-R2`, 25,020 bytes / SHA-256
`ecc760f554e441c8ea910c27f953ce3f4651c398d461d4a0d1b9e959fc5e5809`,
is consumed by the implementation merge.

## Scope And Boundaries

The implementation remained inside the exact four-path writer map:

- `apps/web/src/app/[locale]/components/home/header.tsx`
- `apps/web/src/app/[locale]/components/home/header.test.tsx`
- `apps/web/e2e/gate/public-header-overflow.spec.ts`
- `scripts/repo-size-budget.json`

The final implementation diff contains 259 insertions and 36 deletions.
`apps/web/src/proxy.ts`, canonical routes, `*-page-ready` markers, auth/session/
tenancy, schema/RLS, membership, billing, claim writers, saved-progress
journeys, CI/workflows, deployment and production configuration were not
changed.

Legacy root overflow outside the header subtree remains diagnostic and
unpromoted. It is neither masked nor treated as an `IDA-UI06a` failure. A
future full-page redesign, Hero change or second UI-tree node requires fresh
current authority.

## Verification

Exact implementation-head proof passed:

- focused header unit/component proof and the mandatory Phase C contract:
  `pnpm pr:verify`, `pnpm security:guard` and `pnpm e2e:gate`;
- exact-current-content stressed Chromium/Firefox/WebKit matrix: 3/3, zero
  retries, report SHA-256
  `cd23a035d5bb0d6a9df7f750064d0f73173811136622f9f0f7a985f827e40c48`;
- exact-current-content focus/normal-geometry matrix: 3/3, report SHA-256
  `31ed88ffa3b2e817c752142db1deb24c6315cf09afbd2267c3eed578540b9fe4`;
- public regression lane: 11/11, report SHA-256
  `2ebe7e5b550ad838e552d48bd743eec54cd956773047ae093372323e2d268001`;
- PR rollup: 31/31 terminal green or policy-skipped, zero pending/failed and
  zero unresolved review threads;
- Sonar PR Quality Gate: pass, zero new issues, accepted issues or security
  hotspots;
- CodeQL, gitleaks, pnpm audit, Dependency Review, OSV, Semgrep, reviewdog,
  Pilot Gate, E2E and `pr-finalizer`: pass.

GPT-5.6 Sol Max exact-head senior review passed after the final remediation.
Copilot did not materialize a current-head review after the bounded request and
explicit comment route, so it is classified unavailable rather than approval.
Codex Security diff scan was explicitly waived by user instruction; all
repo-native security evidence remained required and passed.

## Exact-main And Operations

Exact-main evidence is bound to
`6c7bfe2ada5315b2ae5b4955754af9c74a16786a`:

- CI run `31020596390`: success, including validation, audit, static,
  unit/coverage, AI evaluation and E2E gate;
- Sonar Main Gate `31020595293`: success;
- CodeQL `31020595927` and `31020596029`: success;
- Secret Scan `31020596028`: success.

The one automatic exact-main CD run `31020595269` is classified `NON-PASS` for
an environment/network/external-provider runner-connectivity failure. Its Z620
`build-staging` job `92355994309` was cancelled while queued with no runner and
no executed steps. Checkout, registry login, image build, provider mutation,
alias change, staging/production deployment and rollback did not occur; every
downstream job skipped. No repeat full CD was launched.

Mac was used only as control plane/light writer. Z620, under the exclusive
`interdomestik-z620-staging` allocation, supplied the focused three-browser
proof. GitHub-hosted Ubuntu supplied lightweight PR and exact-main evidence.
The conservative observed Z620 minima were 50 GiB free disk and 26,610 MiB
available memory, above the 30 GiB / 8 GiB floors. No production execution was
moved to Z620 and Mac Docker was not started.

## Rollback, Brain And Residual Risk

No deployment occurred, so runtime rollback was neither needed nor exercised.
Code rollback is the exact revert of merge
`6c7bfe2ada5315b2ae5b4955754af9c74a16786a`.

`brain-product-session start --require-active-execution` failed before coding
because production retrieval was stale. No retroactive session is created, and
this slice is not counted as a real M7 cohort session. The durable process
lesson is that future implementation coding must hard-stop until that command
succeeds; Brain remains advisory and repository authority remains final.

Accepted residuals:

1. legacy public-page overflow outside the header subtree remains unpromoted;
2. the Hero and broader public-page redesign remain separate future work;
3. exact-main CD is NON-PASS for contained runner connectivity, with zero
   checkout, build, provider or deployment steps;
4. Copilot current-head review remained unavailable after one bounded route.

No replacement implementation slice is promoted. After this closeout merges,
the expected resolver state is `blocked_requires_current_authority` with
`activeSlice=null`; the next valid action is a fresh current-authority/design
gate in a new task.

## Process Lessons

Future slices must define a smaller acceptance oracle before implementation,
audit every consumer of the touched contract before the first mutation, start
the Brain product session successfully before coding, sweep reviewer feedback
early and once at terminal head, and stop repeated heavy verification after a
failure is fully classified. Docs/tracker closeout uses the repository's
docs-only workflow policy and must not repeat product CI or CD.
