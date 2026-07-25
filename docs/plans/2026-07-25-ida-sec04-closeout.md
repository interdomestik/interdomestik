# IDA-SEC04 closeout — protobufjs parser DoS remediation

## Outcome

`IDA-SEC04` is complete. The existing workspace override now selects exact
`protobufjs@7.6.5`, the first compatible patched release for
`GHSA-j3f2-48v5-ccww` / `CVE-2026-59877`. The lockfile was regenerated without
moving unrelated package resolutions. GitHub Dependabot alert `#154` is fixed.

No audit allowlist or suppression was added. No workflow was manually
dispatched or rerun, and no provider, alias, environment, deployment or
production mutation occurred.

## Authority and exact scope

- Canonical gate `IDA-SEC-DG04` R0: 10,351 UTF-8 bytes, SHA-256
  `44688b85aaa39d2cf2899f34d40b5f6145203ad8287e05437cec5e34b9c4d5ae`.
- Runtime-authority receipt: 5,974 UTF-8 bytes, SHA-256
  `8a80c92b3e7eb54e6dd04107b00da5ee6aa855b11a08007016fba39d7b34cee8`.
- Final implementation base:
  `8f45744b1353874d05e46239894ebc713b4c13c7`.
- Implementation PR:
  [#1430](https://github.com/interdomestik/interdomestik/pull/1430).
- Final implementation head:
  `befd5eeedc4f91ad46b8055e0b8fb8b5018bb997`.
- Squash-merge main SHA:
  `2b930cff5fe8c547f2f5d0bf7a4cebdd45e7fa9d`.
- Exact implementation and merge tree:
  `cc26f22b19bf83d62677fe7123a904b37b433af5`.

The implementation changed only:

1. `pnpm-workspace.yaml`
2. `pnpm-lock.yaml`

The deterministic `scripts/repo-size-budget.json` ceiling was not reached and
did not change. The exact base-to-head diff contains 8 insertions and 14
deletions. The runtime authority is consumed.

## Verification and review

- Focused frozen install: PASS.
- `pnpm why protobufjs --recursive`: every selected runtime path resolves only
  to `protobufjs@7.6.5`.
- Target advisory and vulnerable `7.6.3` resolution: absent.
- Production audit: high `0`, critical `0`; no target advisory.
- Security guard, repository-size and diff checks: PASS.
- Web unit proof: 612 files and 3,032 tests PASS.
- CI contracts: 370/370 PASS.
- Exact-current-head PR checks: all required CI, E2E, Pilot, Sonar, audit,
  Semgrep, OSV, CodeQL, Secret Scan, dependency review and finalizer signals
  PASS, with only expected skips.
- Sonar new issues and hotspots: zero.
- Codex reviewed exact head `befd5eeedc…` and found no major issue.
- Unresolved review threads: zero.

## Z620 pre-push evidence

The exact candidate was materialized on Z620 at
`/home/arben/ci/interdomestik/candidates/befd5eeedc4f91ad46b8055e0b8fb8b5018bb997-ida-sec04`.
The source bundle was 50,308,764 bytes with SHA-256
`b9366ea6bb846a6a75e01796b613940462b6f806e499f7aba42a9db4e969eaaa`.

The code lane passed audit, static, unit and security proof. Its first
validation invocation lacked the required `CI_LOCAL_BASE_SHA`; the unchanged
validation-only rerun passed.

The first resource run passed database/RLS, production build and PR E2E. Its
later merge-E2E and Pilot lanes exposed cross-lane database residue because the
runner reused the same task database after PR E2E; the `free_start_drafts`
foreign key blocked seed cleanup. This was runner-state contamination rather
than candidate code. Merge-E2E and Pilot each passed on their single fresh
task-owned database rerun:

- `/home/arben/ci/interdomestik/runs/ida-sec04-befd5eeed-pre-push-e2e-merge-r2`
- `/home/arben/ci/interdomestik/runs/ida-sec04-befd5eeed-pre-push-pilot-r3`

Post-run proof showed a clean candidate, zero task databases, zero task port
listeners, locks or processes, Forgejo HTTP 200, and healthy PostgreSQL with
restart count zero. Mac Docker remained off.

## CD containment

Automatic CD run `30149452914` was identified for exact merge SHA
`2b930cff…` and cancellation was submitted immediately. GitHub Set up job
completed; checkout, Docker Buildx, registry login, metadata and image build
were skipped. Every downstream staging, rollback, production and deploy job
has `steps: []`.

No checkout, registry login, image build, provider call, alias/environment
mutation, deployment or production mutation occurred. No release or deployment
authority is implied.

## Exact-main health

Exact main `2b930cff5fe8c547f2f5d0bf7a4cebdd45e7fa9d`, tree
`cc26f22b19bf83d62677fe7123a904b37b433af5`, is clean and synchronized with
`origin/main`.

- Sonar Main Gate `30149452941`: PASS.
- CodeQL `30149452764` and `30149452781`: PASS.
- Secret Scan `30149452956`: PASS.
- Main CI `30149452939`: PASS, including E2E Gate, unit, static, audit and AI
  eval jobs.

## Closeout and next action

`IDA-SEC04` is consumed and promotes no replacement implementation slice. The
implementation branch and worktree are removed after this receipt lands.

Dependabot PRs `#1427` and `#1422` are broad, stale grouped upgrades and are
not safe direct-merge candidates. They remain separate follow-up intake:
current-main dependency deltas must be reconciled, compatible updates extracted
under bounded authority, and each stale PR closed as superseded only after its
covered updates have a terminal disposition.

The resolver is expected to return `blocked_requires_current_authority`,
`activeSlice=null` after this closeout. A fresh authority decision is required
before either dependency intake or the next tracker implementation slice.

## Learning recommendation

The Z620 pre-push workflow should allocate a fresh task-owned database per
resource lane, or prove deterministic cleanup before handing one database to
the next lane. This recommendation is derived from the observed PR-E2E to
merge-E2E/Pilot contamination; it is not product evidence and authorizes no
runner or workflow mutation.
