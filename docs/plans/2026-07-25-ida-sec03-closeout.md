# IDA-SEC03 closeout — deterministic Semgrep version pin

## Outcome

`IDA-SEC03` is complete. The shared deterministic-backstops workflow now installs
the already-proven exact scanner version with
`python -m pip install semgrep==1.171.0`. The focused contract prevents a return
to a floating or upgrade-based install while preserving scan flags, base-SHA
behavior, SARIF upload, permissions, conditions and draft policy.

No workflow was manually dispatched or rerun. No provider, alias, environment,
deployment, production or baseline database mutation was performed. The only
database use was the later-authorized ephemeral, task-owned Z620 test database
for mandatory local proof; it was cleaned after the run.

## Authority and exact scope

- Canonical gate `IDA-SEC-DG03` R0: 9,601 UTF-8 bytes, SHA-256
  `897651b165afbdb3efb2770e93b4be4b818a223fabb5a70029ec251d7ef56605`.
- Runtime-authority receipt: 6,855 UTF-8 bytes, SHA-256
  `1841c6084dbb7603d7d1bb063078398016933170b691a00410e1a9a166c518d0`.
- Final implementation base:
  `0dbe72d6bd7d78ee505d30e432773ff77307efca`.
- Implementation PR:
  [#1423](https://github.com/interdomestik/interdomestik/pull/1423).
- Final implementation head:
  `065dddde9604d8e41f01934c641cc7a5f440a27a`.
- Squash-merge main SHA:
  `6981f8a27982488ba0b00d90f00a424d2faf1a1e`.
- Exact merge tree:
  `a6a7b8acf6e52ccc7fa64fff3f3bf347eb78d04b`.

The exact implementation changed only:

1. `.github/workflows/pr-deterministic-backstops.yml`
2. `scripts/ci/pr-deterministic-backstops-contracts.test.mjs`
3. deterministic-only `scripts/repo-size-budget.json`

The exact base-to-head diff contains 14 insertions and 6 deletions. The runtime
authority is consumed.

## Verification and review

- Test-first semantic RED and focused GREEN: PASS.
- Focused Semgrep contract: 1/1 PASS.
- CI contracts: 370/370 PASS.
- Repository size, deterministic budget sync, security guard and diff check:
  PASS.
- Exact-current-head PR checks: 28 PASS, 0 failures, 0 pending, with 2 expected
  skips.
- GitHub E2E Gate, PR E2E Runner, Pilot, unit, SonarCloud, audit, Semgrep, OSV,
  CodeQL and Secret Scan: PASS.
- Codex and Copilot: no actionable finding.
- Unresolved review threads: zero.
- Sonar new issues on the exact PR head: zero.

The one authorized local Z620 merge-E2E attempt reached 33 passed and one known
Help Now watcher failure. The exact failed spec passed 1/1 on the single allowed
focused rerun in a fresh task-owned database and port, classifying the event as
`known_test_flake_confirmed`. GitHub's exact-head E2E Gate then passed. The local
full gate was not repeated, and all task-owned database, port and process
resources were cleaned.

## Dependency-security prerequisite

A newly published high advisory for `brace-expansion` blocked the first exact
PR head through the unchanged production audit gate. It was not folded into the
three-path `IDA-SEC03` scope and was not allowlisted.

Separate narrow PR
[#1424](https://github.com/interdomestik/interdomestik/pull/1424) pinned
`brace-expansion` to `5.0.8` on current main. Its exact final head
`cd7245f19a0efbaa9564c944db85c5842da172a1` passed 28/28 checks and merged as
`0dbe72d6bd7d78ee505d30e432773ff77307efca`. `IDA-SEC03` was then replayed on
that exact main without scope expansion.

## CD containment

Automatic CD run `30133922802` was identified for the exact merge SHA and
cancellation was submitted. GitHub setup and checkout completed before
cancellation took effect; Docker Buildx setup was cancelled. Registry login,
metadata and image build were skipped. Every downstream staging, rollback,
production and deploy job has `steps: []`.

No registry login, image build, provider call, alias/environment mutation,
deployment or production mutation occurred. No release or deployment authority
is implied.

## Exact-main health

Exact main `6981f8a27982488ba0b00d90f00a424d2faf1a1e`, tree
`a6a7b8acf6e52ccc7fa64fff3f3bf347eb78d04b`, is clean and synchronized with
`origin/main`.

- Main CI `30133922780`: PASS, including E2E Gate.
- Sonar Main Gate `30133922774`: PASS.
- CodeQL `30133922546` and `30133922587`: PASS.
- Secret Scan `30133922844`: PASS.

The historical `githubactions:S8544` main blocker is therefore resolved.

## Closeout and next action

`IDA-SEC03` is consumed and promotes no replacement implementation slice. The
sole implementation child, branch and worktree are archived after this receipt
lands. Expected resolver state is `blocked_requires_current_authority`,
`activeSlice=null`.

Dependabot alert `#154` for `protobufjs` is recorded as the next bounded
security candidate, with patched version `7.6.5`. It is not promoted, designed
or implemented by this closeout. A fresh current-authority decision is required
before any gate, branch, writer, mutation or PR for that candidate.

The completed Z620 pre-push acceptance remains closed and is not reopened by
that separate medium advisory. Normal coding may resume only after the resolver
confirms the fresh next action under the canonical fast pre-push flow.
