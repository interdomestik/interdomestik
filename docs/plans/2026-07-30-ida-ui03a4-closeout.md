# IDA-UI03a4 Closeout — Pre-membership Draft Continuity

## Outcome

`IDA-UI03a4` is complete. Authority PR
[#1477](https://github.com/interdomestik/interdomestik/pull/1477) merged the
final same-slice `IDA-DG22-A4` correction at
`ae755991ee11c15cf8eef3d11878ffec05994bc9`. Implementation PR
[#1473](https://github.com/interdomestik/interdomestik/pull/1473) then
squash-merged exact reviewed head
`90c6bb057b4acd1bf06275b9e7c9d4921f646297` as main
`d810758fed387a2fcfe42b384c783c6e27581f6d`.

The public Free Start organizer now keeps eligible vehicle/property notes for
same-browser recovery before membership, offers an explicit resume-or-discard
choice after a cold return, and removes the matching local copy only after the
existing verified-email secure save reaches `saving` → `saved` with a server
draft id. It does not create membership, a claim, a case, a document, or a
cross-device record. The completed `IDA-UI03a1` secure store remains the sole
cross-device authority.

Classification: Tier 3 product/privacy implementation. Runtime authority is
consumed by this merge.

## Authority And Scope

The implementation remained inside the exact cumulative 19-path writer map:
six organizer/recovery source files, four locale files, focused unit/component/
contract/E2E files, the two `cookie-consent` paths authorized by `IDA-DG22-A1`,
and deterministic repository-size metadata. The full binary diff from authority
base `ae755991ee11c15cf8eef3d11878ffec05994bc9` to final head is 227,368 bytes,
SHA-256 `6f907f0ba13a10d40797b724c4ba2ce35086b893d72cd2aa45246fd07ac00ee8`:
19 files, 1,149 insertions and 133 deletions.

`apps/web/src/proxy.ts`, canonical routes, `*-page-ready` markers, auth/session/
OTP orchestration, tenancy, schema/migrations/RLS, billing/Paddle, analytics,
claims, membership, providers, production configuration and architecture
authority were not changed. The final repository inventory at implementation
head was 5,631 files, 59,551,433 total bytes and 7,953,805 source/script bytes.

## Product And Failure Semantics

- Eligible facts are limited to the approved vehicle/property organizer fields.
  Injury/medical facts and generated result content are never stored by this
  recovery path.
- Recovery is same-origin and same-browser with a 30-day logical window. Generic
  hosts, missing/failed Web Locks, denied storage and invalid records fail
  closed without a false saved state.
- Every mutation-capable access uses the one fixed exclusive Web Lock resource.
  Newest-record protection covers competing writes, discard, reset, invalid
  cleanup and verified secure-save promotion.
- Exactly two zero-delay post-grant turns and fresh execution-time TTL/future
  clock validation close the reproduced Firefox coherence race.
- A stalled granted holder is an availability-only residual: siblings time out
  after five seconds without mutation.
- Recovery UI does not steal initial focus; keyboard, accessible-name,
  forced-colors, reduced-motion, text-spacing, 200% presentation and literal
  320/360/390/430 CSS-pixel containment are covered.
- The pre-existing public-header/document overflow at 320 CSS pixels is outside
  this writer map. It remains an explicit unpromoted UI-journey-tree candidate;
  this closeout does not mark it fixed or waived.

## Verification

Final focused proof passed 81/81 unit/component/contract tests, web type-check,
targeted ESLint, Prettier, modularity, repository-size and diff checks, and
`pnpm security:guard`. The late `Error` → `TypeError` remediation reran only
the invalidated focused surface. Earlier unaffected proof was preserved rather
than restarted.

Exact implementation-head GitHub proof:

- CI run `30506278743`: validation, audit, static, E2E gate and unit/coverage
  passed.
- Full PR E2E run `30506278746`: preflight, runner job `90756726151` and
  aggregate passed; 225 passed / 9 policy skips with zero retries. The recovery
  spec ran all eight cases on both `gate-ks-sq` and `gate-mk-contract`.
- Pilot Gate run `30506278745`: preflight, runner job `90757254302` and
  aggregate passed.
- `pr-finalizer` run `30506278742`, job `90756687790`, passed.
- Final rollup: 29 success, 2 policy skips, 0 pending and 0 failed.
- PR Sonar passed A/A/A with 0 open issues, 0 accepted issues, 0 hotspots and
  0 duplication. The two final `S7786` findings were fixed together before
  merge.
- CodeQL Actions and JavaScript/TypeScript, gitleaks, pnpm audit, dependency
  review, Semgrep CE/OSS, OSV and reviewdog passed.
- All 22 review threads are resolved; unresolved count is zero.

The canonical Z620 pre-push supporting lane at implementation parent
`61a990d36c253aac01af80b7b2eeb6eb63cce37f` passed 223 / 9 in 1,554,479 ms.
The task-temporary HTTPS neutral-IDA lane separately passed the complete
recovery matrix in Chromium, Firefox and WebKit. Exact final-head GitHub E2E
reran the complete recovery spec after the final code changes.

Local `pnpm pr:verify` was not restarted after the final two-line TypeError
change: its earlier completed lanes remained valid, the known Mac port-3000
tunnel collision was environment-only, and exact-head CI/E2E/Pilot supplied
the invalidated downstream proof. Mac Docker was not started.

## Review And Security

Claude Opus 4.8 quota was exhausted, as was the requested GPT-5.6 Ultra route.
The approved low-risk fallback, Claude Sonnet 4.6, passed the final patch
(`94.266s`), the Sonar-remediation delta (`77.280s`) and the final TypeError
delta (`35.336s`). Gemini did not produce valid review evidence and is excluded.
The carried valid Opus timing ledger is 22 calls / 4,529.178 seconds, average
205.872 seconds; quota failures, invalid routes and no-output calls are
excluded.

GitHub Codex and Copilot findings on earlier heads were remediated or resolved.
No new current-head Copilot review materialized after the final push; Copilot
activation was not yet available for this repository, so it is classified
unavailable rather than approval. Current-head required repository checks,
Sonar, CodeQL, repo-native security evidence, finalizer and zero unresolved
threads remained merge authority.

Codex Security diff scan was explicitly waived by user instruction. The waiver
does not cover repo-native security proof; `security:guard`, gitleaks, CodeQL,
pnpm audit, Sonar, dependency review, Semgrep and reviewer/security feedback
all passed.

## Exact-main Runtime And Runner Evidence

Exact-main CI `30507056833`, Sonar Main Gate `30507056846`, CodeQL
`30507056367` / `30507056382` and Secret Scan `30507056836` are bound to
`d810758fed387a2fcfe42b384c783c6e27581f6d` and completed `success`. Main CI
passed validation, audit, static, unit/coverage, AI evaluation and E2E gate
(job `90759035787`). Sonar job `90758996099`, gitleaks job `90758996150` and
both CodeQL workflows passed.

The one automatic exact-main CD run `30507056853` completed `success` in
46m25s. Z620 build/attestation job `90758996463` passed in 19m31s and published
exact image
`ghcr.io/interdomestik/interdomestik:staging-d810758fed387a2fcfe42b384c783c6e27581f6d`
at digest
`sha256:0b8b492b5417c7083eeb5a789f1283ecdb862d568d453b3e5c9df15dde527e1a`
with verified provenance and SBOM attestations. Deploy job `90761786077`
passed in 15m17s; the health endpoint, deployed-build provenance and canonical
staging-alias provenance all matched the exact main SHA. Staging E2E job
`90763972865` passed in 10m27s with release checks P0.1, P0.2, P0.3, P0.4 and
P0.6 all `PASS`. Healthy-path rollback job `90765437491` skipped, and
production-evidence/build/deploy/verify jobs skipped because this was an
ordinary main push rather than separately authorized tag/manual production
execution.

Fresh Z620 preflight for that CD observed the exclusive
`interdomestik-z620-staging` runner online, the exact heavy job as its only busy
owner, 61.8 GiB free disk and 24.7 GiB available memory. Workflow-native
preflights remained ready at 56.3 GiB before deploy and 54.7 GiB before E2E;
the dedicated builder inspection passed. Operator sampling during the same run
recorded a conservative minimum of 52 GiB free disk and 17,640 MiB available
memory, still above the 30 GiB / 8 GiB admission thresholds. Staging
build/attestation, Vercel prebuild/deploy, E2E and rollback remain on Z620;
lightweight production evidence remains GitHub-hosted Ubuntu; production
build/deploy/verify remains Mac-only for separately authorized tag/manual
release. No production execution was moved to Z620.

## Rollback, Residual Risk And Next Authority

Code rollback is the exact revert of implementation merge
`d810758fed387a2fcfe42b384c783c6e27581f6d`; recovery data is browser-local and
the feature fails closed when storage or locking is unavailable. The staging
alias rollback contract was already proven by exact-main CD run `30335858120`;
current exact-main CD `30507056853` captured the preimage and skipped rollback
only after build, deploy, health/provenance and release-gate success. Production
is outside this slice.

Accepted residuals:

1. the pre-existing 320-CSS-pixel public-header/document overflow remains an
   unpromoted UI-tree candidate;
2. if a cookie-consent downgrade write fails, a stale readable localStorage
   value may remain, but recovery stays bounded by the approved consent/read
   semantics;
3. a granted Web Lock holder stalled by browser scheduling can delay siblings;
   siblings fail closed after five seconds without mutation.
4. Vercel prebuild emitted fail-closed `DATABASE_URL_RLS` authentication
   diagnostics while statically evaluating protected surfaces. The deployed
   exact-SHA health response reported the database healthy and all role-based
   P0 release checks passed, so this is classified as existing build-time
   credential/diagnostic debt rather than an `IDA-UI03a4` runtime regression.

No replacement implementation slice is promoted. After this closeout merges,
the expected resolver state is `blocked_requires_current_authority` with
`activeSlice=null`. The next valid action is a fresh current-authority selection
that scores the remaining UI journey tree; it must not begin inside this goal.

## Process Lesson

The slice was too large at promotion because the initial gate combined product
behavior, privacy, storage-denial, cross-agent concurrency and a three-browser
proof contract. Future UI-tree gates must split these dependencies before
implementation, audit the entire touched contract before the first mutation,
and define the exact proof environment up front. Review comments must be swept
early and after each substantive remediation so feedback is not discovered
only by the finalizer.
