# IDA-SEC05 closeout — DOMPurify custom-element bypass remediation

## Outcome

`IDA-SEC05` is complete. The existing workspace override now selects exact
`dompurify@3.4.12`, the first compatible patched release for
`GHSA-c2j3-45gr-mqc4`. The lockfile was regenerated without moving unrelated
package resolutions, and GitHub Dependabot alert `#159` is fixed.

No audit allowlist or suppression was added. No workflow was manually
dispatched or rerun, and no provider, alias, environment, deployment or
production mutation occurred.

## Authority and exact scope

- Canonical gate `IDA-SEC-DG05` R0: 10,851 UTF-8 bytes, SHA-256
  `bed35e7013983055667849369de279a69d2d875b79ba1997e7ea529d8a3b9085`.
- Runtime-authority receipt: 6,532 UTF-8 bytes, SHA-256
  `6fc598b4f44b5a1e2712b4bb3a8dcb834949b41bb1e441dd1f85824db15efd65`.
- Final implementation base:
  `ca10589e65162992173c4adad78cd83a4169277f`.
- Implementation PR:
  [#1436](https://github.com/interdomestik/interdomestik/pull/1436).
- Final implementation head:
  `097794397921a26a4eb8f631ebff39f6faca8743`.
- Squash-merge main SHA:
  `494d54ada453563d16c6c7e74e23eb2a68b64ca1`.
- Exact merge tree:
  `7d4ee19e4881db7baff72c58dd8d0c8e63245eb9`.

The implementation changed only:

1. `pnpm-workspace.yaml`
2. `pnpm-lock.yaml`

The deterministic `scripts/repo-size-budget.json` ceiling was not reached and
did not change. The exact base-to-head diff contains six insertions and six
deletions. The runtime authority is consumed.

## Verification and review

- Frozen install, dependency resolution, production audit, security guard,
  repository-size, diff and focused contract proof: PASS.
- Every selected DOMPurify path resolves only to `dompurify@3.4.12`; vulnerable
  `3.4.11` and the target advisory are absent.
- Z620 code, database, production-build, E2E-PR, E2E-merge and Pilot proof:
  PASS. E2E-PR passed 206 tests with nine expected skips; E2E-merge passed 208
  tests with nine expected skips.
- One unit-only correction rerun used a fresh disposable database after the
  resource wrapper incorrectly injected `PLAYWRIGHT=1`; 612 files passed with
  two expected skips, including OTP 4/4. The original negative evidence was
  retained, and no other lane was rerun.
- Exact-current-head PR checks: all required CI, E2E, Pilot, Sonar, audit,
  Semgrep, OSV, CodeQL, Secret Scan, dependency review and finalizer signals
  PASS, with only expected skips.
- Sonar new issues and hotspots: zero.
- Copilot reviewed exact head `0977943979…` and reported no actionable
  findings.
- Codex reviewed exact head `0977943979…` and found no major issue.
- Feedback intake blockers and unresolved review threads: zero.
- Dependabot alert `#159` transitioned to `fixed` at
  `2026-07-25T14:18:44Z`.

## Z620 pre-push evidence

The exact candidate `097794397921a26a4eb8f631ebff39f6faca8743` was
materialized cleanly on Z620. Canonical lane evidence:

- code r2:
  `/home/arben/ci/interdomestik/runs/ida-sec05-097794397-pre-push-code-r2`,
  gate-results SHA-256
  `e33f9c9f72b4bbc97c7bb75f9d22452504216a34f24a4614cfa55e0e0a858cdf`;
- unit correction r3:
  `/home/arben/ci/interdomestik/runs/ida-sec05-097794397-pre-push-unit-r3`,
  gate-results SHA-256
  `23c5f49a84d977c6e584c898b66ad50b323495aca29bfb55fe2b38a93352f8a6`;
- database r1:
  `/home/arben/ci/interdomestik/runs/ida-sec05-097794397-pre-push-database-r1`,
  gate-results SHA-256
  `8007050dcd20b34f6c2bd2cb60ff1bd926db43982251a491aad62163117b64dc`;
- build r1:
  `/home/arben/ci/interdomestik/runs/ida-sec05-097794397-pre-push-build-r1`,
  gate-results SHA-256
  `dcc4985478453784ab28d169faf7c3511c730ae93d1e48e2784e7cc77970200b`;
- E2E-PR r1:
  `/home/arben/ci/interdomestik/runs/ida-sec05-097794397-pre-push-e2e-pr-r1`,
  gate-results SHA-256
  `014427cd140df3a485f56dec513a5cd3dea5ab2f0cd3fdc6755ce28884e555c7`;
- E2E-merge r1:
  `/home/arben/ci/interdomestik/runs/ida-sec05-097794397-pre-push-e2e-merge-r1`,
  gate-results SHA-256
  `da3aef84a1eca74b7178c809d5c9b078819c90430980b329d89714d0c01252e8`;
- Pilot r1:
  `/home/arben/ci/interdomestik/runs/ida-sec05-097794397-pre-push-pilot-r1`,
  gate-results SHA-256
  `9f27c2c1516cf4c3b11ddc63fe40e2c8c1963ffe436999ea5f5cc6b8402665ff`.

The source bundle is
`/home/arben/ci/interdomestik/candidates/097794397921a26a4eb8f631ebff39f6faca8743-ida-sec05.bundle`,
50,436,467 bytes, SHA-256
`06b01f6e7d32f552f854bb477f7edf56831523d0fa0c29cec7ed51c84197171d`.

The permit validator returned `permitProblems: []`. A cryptographically signed
permit was not emitted because `Z620_PERMIT_SIGNING_KEY` was unavailable in
the noninteractive environment; the accepted push authority was therefore the
explicit exact-SHA textual verdict. Any candidate change would have invalidated
that verdict.

Post-run proof showed zero task processes, databases, port listeners, locks or
state; baseline listeners were unchanged. PostgreSQL, Supabase and Forgejo were
healthy, Mac Docker remained off, and no provider or production system was
contacted.

## CD containment

Automatic CD run `30161388554` for exact merge SHA `494d54ada…` completed
`failure` before the cancellation request could be submitted. GitHub setup and
checkout succeeded; Docker Buildx then failed. Registry login, metadata and
image build were skipped. Every downstream staging, rollback, production and
deploy job had `steps: []`.

The gate's containment boundary remained intact: no registry login, image
build, provider call, alias/environment mutation, deployment or production
mutation occurred. The run was not rerun.

## Exact-main health

Exact main `494d54ada453563d16c6c7e74e23eb2a68b64ca1`, tree
`7d4ee19e4881db7baff72c58dd8d0c8e63245eb9`, is synchronized with
`origin/main`.

- Sonar Main Gate `30161388528`: PASS.
- CodeQL runs `30161388387` and `30161388402`: PASS.
- Secret Scan `30161388583`: PASS.
- Main CI `30161388536`: PASS, including validation, static, unit, E2E Gate,
  AI eval and audit.

## Closeout and next action

`IDA-SEC05` is consumed and promotes no replacement implementation slice. The
implementation branch and worktree are removed after this receipt lands.

Alerts `#157` and `#158`, grouped dependency PRs `#1422` and `#1432`, frozen
`IDA-UI03a2`, UI/product and every architecture successor remain separate and
unpromoted. A fresh current-authority decision is required before the next
slice. `IDA-UI03a2-P0a1a1b` remains a logical product candidate, not current
implementation authority.

The resolver is expected to return `blocked_requires_current_authority`,
`activeSlice=null` after this closeout.

## Learning recommendation

No product-memory update is needed. Preserve two workflow lessons:

1. exact-SHA Z620 proof remains supporting evidence; current-head GitHub
   feedback and required checks remain merge authority;
2. the noninteractive permit path should expose the signing key or fail with a
   single explicit unsigned-verdict classification before expensive lanes
   begin.

These recommendations are operational learning only and authorize no runner,
workflow, Brain, Wiki or product mutation.
