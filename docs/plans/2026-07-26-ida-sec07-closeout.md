# IDA-SEC07 closeout — body-parser invalid-limit DoS remediation

## Outcome

`IDA-SEC07` is complete. The workspace now selects exact
`body-parser@2.3.0` across the affected Express and Inngest paths. The patched
release rejects invalid request-size limits instead of silently disabling size
enforcement.

GitHub Dependabot alert `#157`, `GHSA-v422-hmwv-36x6` /
`CVE-2026-12590`, transitioned to `fixed` at `2026-07-25T22:23:00Z`. No
audit allowlist or suppression was added. No workflow was manually dispatched
or rerun, and no provider, alias, environment, deployment or production
mutation occurred.

## Authority and exact scope

- Canonical gate `IDA-SEC-DG07` R0: 13,663 UTF-8 bytes, SHA-256
  `5bc950c34ea82b2b541acc56aae1cc17f4a590c033f1633d98f8361e95211dc1`.
- Runtime-authority receipt R5: 17,147 UTF-8 bytes, SHA-256
  `3adcf895093029b32f279881a0e729ec0f3d174c1bef3729e346a8b5d57d108f`.
- Final implementation base:
  `7783a3cabbea3433235162bb36ea734b86949fcc`.
- Implementation PR:
  [#1442](https://github.com/interdomestik/interdomestik/pull/1442).
- Final implementation head:
  `a9e1da58e0de9b2b976284477607c9dc6efd38e0`.
- Squash-merge main SHA:
  `10d59b279fec82e9b4e2c8f65eb2af415cd187b5`.
- Exact implementation and merge tree:
  `20b84f613727f1a6fb208217caae36783599beb5`.

The implementation changed only:

1. `pnpm-workspace.yaml`
2. `pnpm-lock.yaml`
3. `scripts/repo-size-budget.json` — deterministic synchronization only

The exact base-to-head diff contains 10 insertions and 8 deletions. The gate
and runtime receipt are consumed.

## Continuity dispositions

R1 preserved the unrelated
`@vitest/coverage-v8@4.1.9(vitest@4.1.9)` peer context after pnpm normalized
it during lock regeneration. The accepted final tree retains only the target
override, `body-parser@2.3.0`, its required `content-type@2.0.0` edge and the
patched Express selection.

R2 records that the repository lint-staged hook matched the generated
`pnpm-lock.yaml` and Prettier rewrote its canonical pnpm formatting. The
invalid local-only intermediate commit remains historical negative evidence.
The final corrective commit restored pnpm's generated format and disabled
Husky for that commit only. The hook is explicitly **BYPASSED / NOT PASS**;
full focused, security, Z620 and GitHub proof replaces no other gate and does
not authorize a general hook bypass.

R3 classified one Z620 audit-only failure as an invocation/environment defect:
the wrapper omitted required test environment values. The original negative
evidence was retained, and only the failed audit group was corrected on the
unchanged candidate.

R4 classified the base-identical Help Now signed-in-member watcher as
`known_test_flake_confirmed` after exactly one focused unchanged-SHA rerun
passed. A fresh full E2E-PR lane then passed before E2E-merge and Pilot
continued. No passing group was repeated.

## Verification and review

- Frozen install and exact dependency-resolution proof: PASS.
- `body-parser@2.2.2` and the target advisory are absent from the accepted
  graph.
- Express, Inngest, MCP and unrelated dependency selections are preserved.
- Production audit: high `0`, critical `0`; no target advisory.
- Security guard, repository-size, diff and focused format checks: PASS.
- CI contracts and repository mandatory proof: PASS.
- Exact-current-head PR checks: 29 PASS, 0 failure, 0 pending, with 2 expected
  skips.
- Required CI, E2E, Pilot, Sonar, audit, Semgrep, OSV, CodeQL, Secret Scan,
  dependency review and finalizer signals: PASS.
- Sonar new issues and hotspots: zero.
- Codex reviewed exact head `a9e1da58e0…` and found no actionable issue.
- Copilot was unavailable until 2026-08-01 and is explicitly NON-PASS, not
  inferred as approval.
- Feedback-intake blockers and unresolved actionable review threads: zero.

## Z620 exact-SHA FULL evidence

The exact candidate `a9e1da58e0de9b2b976284477607c9dc6efd38e0` was
materialized cleanly on Z620 and used only IDA-SEC07-owned disposable
resources. The FULL profile selected validation, audit/contracts, static,
unit, database, production build, E2E PR, E2E merge and Pilot. Release and
deployment lanes remained unauthorized.

The retained exact evidence hashes are:

- code r1 negative evidence:
  `aa05119cd17c62e67196d4f7bd9d7f8867749b57db1dcdc0df198f70e9d176f9`;
- audit correction r2:
  `45c31cf4fd467145ede80c91117a8698599ff3bb6f9513317cb9ffc240b178ed`;
- database r1:
  `63f6d9a4702dcc435a7afadb2aecdf1fdea63c2c9c32a9d263f70cc161d14da5`;
- production build r1:
  `eaba5235e38e431cb61741484bbb4a84ead88b338cdc389a18bbcc5b62e5e5b2`;
- E2E-PR r1 retained Help Now negative evidence:
  `980abcf74642837d313c928d5071c9fdff1cdd31c6c17fb0abe4cd866fce8c80`;
- focused R4 flake classification:
  `e89fc9e98ae0d2f3a3c1b23dac0a02c3e7c144460b9da875621175c718001707`;
- full E2E-PR R4:
  `fa14dc525b2bdde3f4968289f86e208f1f0391254df12aede88868a1df26df0d`;
- E2E-merge r1:
  `f1b6935297ca41d8519f5e4910f07885e1c737b40c699765c0311efef90730a5`;
- Pilot r1:
  `fbe996cec419442e8fc0c6230316698c863e7fa153d1b9d1a3f4a5c75a8c1e14`.

The exact verified source bundle is
`/home/arben/ci/interdomestik/candidates/a9e1da58e0de9b2b976284477607c9dc6efd38e0-ida-sec07-r1.bundle`,
50,331,020 bytes, SHA-256
`726eadd8b32c90bcb20c9f96a263cd5a3be163ede43667fccb5f181d758f7cc4`.

Post-run proof showed zero IDA-SEC07 task databases, ports, locks or processes.
PostgreSQL remained healthy, Forgejo returned HTTP 200, baseline listeners
were untouched, Mac Docker remained off, and no provider or production system
was contacted.

## CD containment

Automatic CD run `30177459000` for exact merge SHA `10d59b279…` completed
`failure` in 21 seconds before cancellation could take effect. Set up and
checkout succeeded; Docker Buildx then failed. Registry login, metadata and
image build were skipped. Every staging, rollback, production and deploy job
has `steps: []`.

The first local cancellation helper also collided with zsh's read-only
`status` variable; corrected inspection found the run already terminal. This
local helper defect changed no GitHub or runtime state.

The run is classified **failed-contained before registry/image/provider/deploy**.
No registry login, image build, provider call, alias/environment mutation,
deployment or production mutation occurred. This is not represented as a
successful cancellation and implies no release or deployment authority.

## Exact-main health

Exact main `10d59b279fec82e9b4e2c8f65eb2af415cd187b5`, tree
`20b84f613727f1a6fb208217caae36783599beb5`, is synchronized with
`origin/main`.

- Main CI `30177458997`: PASS, including validation, static, unit, E2E Gate,
  AI eval and audit.
- Sonar Main Gate `30177459001`: PASS.
- CodeQL runs `30177458725` and `30177458749`: PASS.
- Secret Scan `30177459040`: PASS.

## Closeout and next action

`IDA-SEC07` is consumed and promotes no replacement implementation slice. The
implementation branch and worktree are removed after this receipt lands.

Grouped Dependabot PRs `#1422` and `#1432` are terminally closed by Dependabot
as superseded. Their live replacements `#1443` and `#1444` overlap in
`pnpm-lock.yaml` and are not authorized for direct concurrent merge by this
receipt. The accepted queue is a fresh bounded dependency-maintenance
reconciliation of `#1443` first, then a refreshed current-main disposition of
`#1444`, one authority and one writer at a time.

Frozen `IDA-UI03a2`, UI/product and every architecture successor remain
separate and unpromoted. A fresh current-authority decision is required before
either replacement dependency PR or any product implementation begins.

The resolver is expected to return `blocked_requires_current_authority`,
`activeSlice=null` after this closeout.

## Learning recommendation

No product-memory update is needed. The warranted operational recommendations
are:

1. exclude pnpm-generated lockfiles from formatter write hooks, or prove a
   pnpm-safe check-only contract;
2. retain original negative evidence and permit only a focused unchanged-SHA
   correction for classified invocation/environment defects;
3. keep the Help Now protected-route watcher in the flake-maintenance queue;
4. use disposable task-owned databases and a single coordinated runner;
5. avoid shell helper variable names reserved by the active shell.

These are operational recommendations only. They authorize no hook, runner,
workflow, Brain, Wiki, product, provider or deployment mutation.
