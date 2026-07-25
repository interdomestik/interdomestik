# IDA-SEC06 closeout — Hono Node Server security remediation

## Outcome

`IDA-SEC06` is complete. The workspace now selects exact
`@hono/node-server@2.0.10` for both transitive development/QA paths. This
removes the Windows encoded-backslash path-traversal advisory
`GHSA-frvp-7c67-39w9` and also avoids the subsequently detected WebSocket
handshake memory-leak advisory `GHSA-9mqv-5hh9-4cgg`.

GitHub Dependabot alert `#158` transitioned to `fixed` at
`2026-07-25T18:41:49Z`. No audit allowlist or suppression was added. No
workflow was manually dispatched or rerun, and no provider, alias,
environment, deployment or production mutation occurred.

## Authority and exact scope

- Canonical gate `IDA-SEC-DG06` R0: 11,581 UTF-8 bytes, SHA-256
  `cf440d257de50f524123188e984977c82add06b1f5d9adef828fed7da4feb66c`.
- Runtime-authority receipt: 6,615 UTF-8 bytes, SHA-256
  `8a113f5bb80e5b7e98250000de6da165163e0b77f797da0b28bcfc651f5ded1e`.
- OSV target-correction addendum: 3,264 UTF-8 bytes, SHA-256
  `ee9372836f504e2be4a7a7a1df771eec244face418a1188b29c3880f9decab7d`.
- Lock-restore continuity receipt: 1,430 UTF-8 bytes, SHA-256
  `8686bbb04b0b966dada36ed39d4c41760234600a2b4aa4d66d8b87005b743da9`.
- Formatter-only precommit continuity receipt: 1,773 UTF-8 bytes, SHA-256
  `3d6afe05b69c41af61b706eca8120cb638d341706f9b313180828cc7ad817dd8`.
- Final implementation base:
  `280dab9172e0fed048ac39750214743be350f4ef`.
- Implementation PR:
  [#1439](https://github.com/interdomestik/interdomestik/pull/1439).
- Final implementation head:
  `25130343ee5365c7bf541652e0a23e388cd39d23`.
- Squash-merge main SHA:
  `18f2c130f19bd9985ad7f68a4f639f15ef8047eb`.
- Exact implementation and merge tree:
  `e274938186e0c26be86d976909fe6a5ec48fcb37`.

The implementation changed only:

1. `pnpm-workspace.yaml`
2. `pnpm-lock.yaml`
3. `scripts/repo-size-budget.json` — deterministic synchronization only

The exact base-to-head diff contains 13 insertions and 11 deletions. The
runtime authority and all implementation continuity receipts are consumed.

## Version correction

The gate originally selected `2.0.5`, the first patched release for
`GHSA-frvp-7c67-39w9`. Exact-head GitHub OSV then reported the newly published
`GHSA-9mqv-5hh9-4cgg`, affecting `@hono/node-server` through `2.0.9`.

The accepted target-correction addendum preserved the same slice, writer,
branch, PR and three-path ceiling while changing only the exact target to
`2.0.10`. The original negative evidence remains part of the audit trail; no
check was weakened or allowlisted.

## Verification and review

- Frozen install and QA package compilation: PASS.
- Both `@modelcontextprotocol/sdk` and `@upstash/context7-mcp` dependency paths
  resolve only to `@hono/node-server@2.0.10`.
- Both target GHSAs and the vulnerable `1.19.13` / `2.0.5` resolutions are
  absent.
- Production audit: high `0`, critical `0`; no target advisory.
- Security guard, repository-size, diff and focused format checks: PASS.
- CI contracts: 434/434 PASS.
- E2E base contracts: PASS.
- Exact-current-head PR checks: all required CI, E2E, Pilot, Sonar, audit,
  Semgrep, OSV, CodeQL, Secret Scan, dependency review and finalizer signals
  PASS, with only expected skips.
- Sonar new issues and hotspots: zero.
- Codex reviewed exact head `25130343ee…` and found no major issue.
- Copilot was unavailable until 2026-08-01 and is explicitly NON-PASS, not
  inferred as approval.
- Feedback intake blockers and unresolved review threads: zero.

## Z620 proportional pre-push evidence

The exact candidate `25130343ee5365c7bf541652e0a23e388cd39d23` was
materialized cleanly on Z620. This bounded Tier-1 transitive-development patch
used the selected FAST profile only:

- validation;
- audit/contracts;
- static;
- unit;
- security.

Database, production-build resource, browser E2E, Pilot, release, deployment
and provider lanes were explicitly `not_selected` and were not run.

The initial evidence is:

`/home/arben/ci/interdomestik/runs/ida-sec06-25130343-fast-r1`

with gate-results SHA-256
`3ef1a0f9197e035095ecd43c162db688268bd362d5340c5a59fc268bbbb82809`.
Audit, static, unit and security passed. Validation failed only because the
invocation omitted the exact base SHA. Exactly one validation-only correction
ran on the unchanged candidate:

`/home/arben/ci/interdomestik/runs/ida-sec06-25130343-fast-validation-r2`

with gate-results SHA-256
`717eaf28b6fcdbe55767f9e263bcba8e1b1d657d5a4710d7106af2b96a790da9`.
No passing lane was repeated.

The source bundle is
`/home/arben/ci/interdomestik/candidates/25130343ee5365c7bf541652e0a23e388cd39d23-ida-sec06-r1.bundle`,
50,444,014 bytes, SHA-256
`bb33baa58388c60bca78f48f50aac78b4d6570064b5d5997f8ea389f8d761fad`.

The permit validator returned `permitProblems: []`. A signed permit was not
emitted because `Z620_PERMIT_SIGNING_KEY` was unavailable in the
noninteractive environment; the accepted push authority was the explicit
exact-SHA textual verdict.

Post-run proof showed zero task databases, ports, locks or processes.
PostgreSQL remained healthy with restart count zero, baseline listeners were
untouched, Mac Docker remained off, and no provider or production system was
contacted.

## CD containment

Automatic CD run `30170136526` for exact merge SHA `18f2c130…` was identified
while queued and cancellation was submitted immediately. It is terminal
`cancelled`; all eight jobs have `steps: []`.

No checkout, registry login, image build, provider call, alias/environment
mutation, deployment or production mutation occurred. No release or deployment
authority is implied.

## Exact-main health

Exact main `18f2c130f19bd9985ad7f68a4f639f15ef8047eb`, tree
`e274938186e0c26be86d976909fe6a5ec48fcb37`, is synchronized with
`origin/main`.

- Sonar Main Gate `30170136557`: PASS.
- CodeQL runs `30170136405` and `30170136442`: PASS.
- Secret Scan `30170136548`: PASS.
- Main CI `30170136553`: PASS, including validation, static, unit, E2E Gate,
  AI eval and audit.

## Closeout and next action

`IDA-SEC06` is consumed and promotes no replacement implementation slice. The
implementation branch and worktree are removed after this receipt lands.

Dependabot alert `#157` remains open and is the next bounded security intake
candidate. Grouped dependency PRs `#1422` and `#1432` remain broad, stale and
unsafe for direct merge; their current-main deltas must be reconciled only
after each covered security update has a terminal disposition.

Frozen `IDA-UI03a2`, UI/product and every architecture successor remain
separate and unpromoted. A fresh current-authority decision is required before
`#157` or any product implementation begins.

The resolver is expected to return `blocked_requires_current_authority`,
`activeSlice=null` after this closeout.

## Learning recommendation

No product-memory update is needed. The accepted operational learning is to
promote, in a separate future CI/governance slice, a machine-readable pre-push
profile resolver:

1. FAST by default for bounded Tier-0/Tier-1 transitive-development patches;
2. FULL only on explicit runtime, schema, routing/auth, shared-infrastructure
   or equivalent risk triggers;
3. RELEASE as a separate authority;
4. ambiguous classification fails closed to HOLD;
5. one focused unchanged-SHA rerun is allowed only for a classified
   invocation or environment defect.

This recommendation is operational memory only. It authorizes no runner,
workflow, Brain, Wiki, product or deployment mutation.
