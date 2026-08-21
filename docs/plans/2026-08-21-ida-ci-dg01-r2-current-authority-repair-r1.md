# IDA-CI-DG01-R2 Current-Authority Repair R1

Status: frozen pre-authority candidate; no repository or runtime authority

## Exact binding

- Candidate ID: `IDA-CI-DG01-R2-CURRENT-AUTHORITY-REPAIR-R1`
- Future canonical path:
  `docs/plans/2026-08-21-ida-ci-dg01-r2-current-authority-repair-r1.md`
- Protected-main base: `eaa9bd108f29ce386b185c46b8474ee1c3747774`
- R2 governance PR: `#1608`
- R2 reviewed head: `59eb752736c2868c995f7ae4d62d3236d221e4c2`
- R2 merge/main: `eaa9bd108f29ce386b185c46b8474ee1c3747774`
- Canonical R2 gate: 30,529 UTF-8 bytes; SHA-256
  `d4ac2815f7d3132527cd5d281edc91d5224eec209b68ac2a83e044d4633c46d5`
- Canonical A1 admission V2: 33,514 UTF-8 bytes; SHA-256
  `cc504ebb77d5990a2646620290a9d850e41996b637238be553bf02bf18f4c904`

Any protected-main drift before materialization stops this candidate for a new factual audit,
formatter pass, review, byte count, SHA-256, and exact human approval. There is no silent rebase.

## One outcome

Make CI01's current-program/current-tracker authority truthful and complete about the already
merged R2 governance result, and close the exact R2 authority-worktree/branch hygiene debt so a
later A1 runtime receipt can be drafted against the returned repair merge/main SHA.

This repair does not authorize A1 implementation. Its successful repository postcondition remains
`awaiting_runtime_authority`, `runtime_authorized:false`, and `activeSlice:null`.

## Why a separate repair is mandatory

Protected main contains the final canonical R2 bytes (`d4ac2815…` / `cc504ebb…`), and the active
queue uses those identities. The proof-ledger row still names `5f5700cc…` / `b2f681f1…` and the
pre-R2 base/main `ca91e67e…`. Those are the intermediate identities at commit `d56bf0a5e`, not the
canonical tree merged by PR #1608; the admission was subsequently corrected at `a5ffcc51f`, and
both final artifacts were rebound at reviewed head `59eb75273`. The tracker therefore disagrees
with the repository artifacts and with protected main.

The R2 authority worktree and its local/remote branch also remain present. The frozen A1 prototype
worktree is separate provenance and must remain byte-for-byte untouched. Under the canonical gate,
identity/convergence or cleanup failure requires a separately authorized current-authority repair;
it cannot be folded silently into a runtime receipt.

A runtime receipt frozen now against `main@eaa9bd1…` would become stale as soon as this repair
merged, because the canonical gate requires protected-main equality at receipt drafting, approval,
and fresh-child creation. Therefore no content-addressed A1 runtime receipt is created by this
candidate.

## Exact writer map

The repair PR may write only these semantic/governance paths:

1. `docs/plans/2026-08-21-ida-ci-dg01-r2-current-authority-repair-r1.md`
2. `docs/plans/current-program.md`
3. `docs/plans/current-tracker.md`
4. `scripts/repo-size-budget.json` only if the unchanged canonical size-sync command produces a
   deterministic delta caused solely by writers 1-3

No other repository path is admitted. The existing six-file detached prototype, the frozen
`/private/tmp/ida-ci01-a1-shadow` worktree, OD17, selectors, coverage logic, workflows, product,
auth, routing, tenancy, schema, RLS, billing, E2E, providers, AI OS, and runtime state are non-goals.

## Exact compact projections

`docs/plans/current-program.md` changes only the CI01 R2 paragraph. It must say:

> R2 gate `d4ac2815f7d3132527cd5d281edc91d5224eec209b68ac2a83e044d4633c46d5`
> and A1 admission V2
> `cc504ebb77d5990a2646620290a9d850e41996b637238be553bf02bf18f4c904`
> were merged by PR #1608 as reviewed head
> `59eb752736c2868c995f7ae4d62d3236d221e4c2` to protected
> `main@eaa9bd108f29ce386b185c46b8474ee1c3747774`. Exact main health and CD
> containment passed, but proof-ledger identity and R2 branch/worktree cleanup remained open. This
> governance repair corrects those two convergence debts without granting runtime authority. Only
> after its returned main passes exact health, containment, cleanup, and hygiene may a separately
> drafted, byte-exact approved A1 runtime receipt bind that returned main before semantic work.

The paragraph retains exactly one CI01 authority marker:
`awaiting_runtime_authority`, `runtime_authorized:false`, `activeSlice:null`.

`docs/plans/current-tracker.md` retains one Active Queue row and one Proof Ledger row for CI01.
The Active Queue row receives the same compact PR #1608/main-health/receipt-pending statement. The
Proof Ledger source references become exactly:

`dg01-r2:d4ac2815`; `admission-a1-v2:cc504ebb`; `pr:1608`;
`reviewed-head:59eb7527`; `main:eaa9bd10`

The Proof Ledger execution stays `pending`; no A1 run ID, runtime proof, Docker proof, Sentry proof,
or learning result is invented. Evidence references identify the two canonical R2 artifacts, PR
#1608, the terminal-green exact-head checks, the terminal-green exact-main security/analysis runs,
and the contained CD run. Historical OD17 text and rows remain byte-identical.

## Factual evidence frozen before materialization

- PR #1608 reviewed head: `59eb752736c2868c995f7ae4d62d3236d221e4c2`.
- PR #1608 merge/main: `eaa9bd108f29ce386b185c46b8474ee1c3747774`.
- R2 head tree equals merge tree:
  `24afad0a9f68bcd26a0381f56820b2d090a995fe`.
- Exact-main SonarCloud, sonar-gate, CodeQL JavaScript, CodeQL Actions, and gitleaks are terminal
  success.
- Exact-main `cd.yml` run `32482906284` is terminal cancelled with no runner assignment and no
  steps; this proves containment only and grants no deployment/provider authority.
- The canonical R2 runtime-receipt path is absent on protected main.
- Resolver state is `awaiting_runtime_authority`, `runtimeAuthorized:false`, with CI01 A1 only a
  candidate.

## Exact cleanup boundary

After the repair merge passes exact-main health and CD containment, cleanup may remove only:

- worktree `/private/tmp/ida-ci01-r2-authority`;
- local branch `codex/ida-ci01-r2-authority`;
- remote branch `origin/codex/ida-ci01-r2-authority`;
- the fresh repair worktree and its local/remote repair branch.

The cleanup must preserve the canonical dirty checkout, its six prototype paths,
`/private/tmp/ida-ci01-a1-shadow`, `codex/ida-ci01-a1-shadow`, and every unrelated branch/worktree.
The A1 prototype remains provenance only; it is not an implementation writer.

Branch-hygiene proof must show the exact R2 and repair identities absent while all explicit
preserves remain present and untouched. An unrelated stale branch/worktree is reported, not
deleted. Cleanup is not authority to mutate AI OS, providers, runtime, or repository semantics.

## Materialization sequence after exact approval

The executor resolves the canonical repository path as
`/Users/arbenlila/development/interdomestik-crystal-home` and uses a fresh worktree outside the
dirty checkout.

```bash
git -C /Users/arbenlila/development/interdomestik-crystal-home fetch origin main
git -C /Users/arbenlila/development/interdomestik-crystal-home rev-parse origin/main
git -C /Users/arbenlila/development/interdomestik-crystal-home worktree add -b codex/ida-ci01-r2-current-authority-repair /private/tmp/ida-ci01-r2-current-authority-repair eaa9bd108f29ce386b185c46b8474ee1c3747774
git -C /private/tmp/ida-ci01-r2-current-authority-repair rev-parse HEAD
git -C /private/tmp/ida-ci01-r2-current-authority-repair status --short --branch
cp /private/tmp/IDA-CI-DG01-R2-CURRENT-AUTHORITY-REPAIR-R1.md /private/tmp/ida-ci01-r2-current-authority-repair/docs/plans/2026-08-21-ida-ci-dg01-r2-current-authority-repair-r1.md
pnpm --dir /private/tmp/ida-ci01-r2-current-authority-repair install --offline --frozen-lockfile --ignore-scripts
/private/tmp/ida-ci01-r2-current-authority-repair/node_modules/.bin/prettier --write /private/tmp/ida-ci01-r2-current-authority-repair/docs/plans/2026-08-21-ida-ci-dg01-r2-current-authority-repair-r1.md /private/tmp/ida-ci01-r2-current-authority-repair/docs/plans/current-program.md /private/tmp/ida-ci01-r2-current-authority-repair/docs/plans/current-tracker.md /private/tmp/ida-ci01-r2-current-authority-repair/scripts/repo-size-budget.json
/private/tmp/ida-ci01-r2-current-authority-repair/node_modules/.bin/prettier --check /private/tmp/ida-ci01-r2-current-authority-repair/docs/plans/2026-08-21-ida-ci-dg01-r2-current-authority-repair-r1.md /private/tmp/ida-ci01-r2-current-authority-repair/docs/plans/current-program.md /private/tmp/ida-ci01-r2-current-authority-repair/docs/plans/current-tracker.md /private/tmp/ida-ci01-r2-current-authority-repair/scripts/repo-size-budget.json
pnpm --dir /private/tmp/ida-ci01-r2-current-authority-repair track:audit
pnpm --dir /private/tmp/ida-ci01-r2-current-authority-repair plan:status
pnpm --dir /private/tmp/ida-ci01-r2-current-authority-repair plan:audit
pnpm --dir /private/tmp/ida-ci01-r2-current-authority-repair docs:verify
node /private/tmp/ida-ci01-r2-current-authority-repair/scripts/repo-size-budget-sync.mjs
pnpm --dir /private/tmp/ida-ci01-r2-current-authority-repair repo:size:check
pnpm --dir /private/tmp/ida-ci01-r2-current-authority-repair security:guard
git -C /private/tmp/ida-ci01-r2-current-authority-repair diff --check
git -C /private/tmp/ida-ci01-r2-current-authority-repair status --short
```

The offline, frozen, scripts-disabled dependency install is untracked execution support only; any
lockfile delta is a blocker. Before commit, the executor must prove the diff contains only the
admitted paths, repeat formatter CHECK after any size-sync delta, and perform one consolidated
ordinary Sol High review. Any edit restarts formatting, mechanical checks, review consolidation,
byte count, and hash binding.

Only the exact reviewed head may be pushed and proposed as one governance-only PR. The PR may merge
only after required exact-head checks are terminal green, actionable/unresolved review feedback is
zero, and protected main still descends from the approved base without an unreviewed rebase.

Before merge, an exact-SHA watcher is armed for the expected merge SHA. It may cancel only the
matching `cd.yml` push/main run before runner assignment, steps, or provider effects. Terminal
cancelled, runner null, and steps empty are mandatory. Any assignment, step, or provider effect is
an incident and stops the sequence; cancellation is never deployment authority.

After merge, exact-main SonarCloud, sonar-gate, both CodeQL lanes, gitleaks, resolver/audit, and CD
containment must pass. Only then does the exact cleanup boundary above execute and branch-hygiene
proof close. A failure leaves runtime unauthorized and forbids receipt drafting.

## Deterministic size-metadata condition

`scripts/repo-size-budget.json` is a writer only when the unchanged canonical
`node scripts/repo-size-budget-sync.mjs` command, run after writers 1-3 are final, produces a
deterministic metadata-only delta. The same command rerun must be idempotent, and
`repo:size:check` must pass. If no delta is produced, the file must remain byte-identical and
absent from the PR. A delta unrelated to writers 1-3 is a stop, not a reason to widen scope.

## Failure closure and rollback/no-op boundary

- Base drift before worktree creation: no-op; do not create the worktree or branch.
- Candidate byte/SHA mismatch: no-op; do not materialize.
- Unexpected writer or prototype delta: restore only the fresh repair worktree to its approved base
  or discard that fresh worktree; never touch the canonical dirty checkout or frozen prototype.
- Check/review failure before merge: keep runtime unauthorized, do not merge, consolidate at most
  once, and return for a newly frozen identity if bytes change.
- CD/main-health/resolver failure after merge: incident closeout; `runtime_authorized:false`,
  `activeSlice:null`, successors blocked, no receipt drafting, no A1.
- Cleanup/hygiene failure: stop for separately authorized cleanup/incident handling; do not delete
  unrelated or preserved identities.
- Successful repair: exact main health and cleanup proof complete, but state still
  `awaiting_runtime_authority`, `runtime_authorized:false`, `activeSlice:null`.

## Subsequent A1 receipt hold

Only after successful repair convergence may the executor draft
`IDA-CI01-PR-UNIT-SHADOW-A1-RUNTIME-RECEIPT-R2` at
`docs/plans/2026-08-20-ida-ci-pr-unit-shadow-a1-runtime-receipt-r2.json`, bound to the returned
repair merge/main SHA and to the unchanged canonical gate/admission hashes above. That receipt must
be formatter-clean, mechanically green, reviewed, byte-counted, SHA-256 frozen, and explicitly
approved by Arben. The approval must name the exact receipt ID, bytes, SHA-256, and returned main.

Only execution of that exact approved receipt may transition to
`active_implementation`, `runtime_authorized:true`, with `activeSlice` exactly
`IDA-CI01-PR-UNIT-SHADOW-A1`. No blanket or prospective approval is recorded as that receipt
approval.

## Approval semantics

Approval of this candidate authorizes only the bounded current-authority repair lifecycle and the
exact cleanup identities above. It does not approve the later runtime receipt, A1 semantic work,
test selection, CI dispatch, A2, provider actions, or any OD17 change.
