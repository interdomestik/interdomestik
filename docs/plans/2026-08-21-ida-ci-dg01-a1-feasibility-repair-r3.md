# IDA-CI-DG01 A1 Feasibility Repair R3

Status: candidate only; no repository or runtime authority
Base: protected `main@7fb7180aafadf91b79ec37f5daeebaa85bc86ff2`
Parent gate: `docs/plans/2026-08-20-ida-ci-dg01-pr-unit-selection-r2.md` at SHA-256
`d4ac2815f7d3132527cd5d281edc91d5224eec209b68ac2a83e044d4633c46d5`
Parent admission: `docs/plans/2026-08-20-ida-ci-pr-unit-shadow-a1-admission-v2.json` at
SHA-256 `cc504ebb77d5990a2646620290a9d850e41996b637238be553bf02bf18f4c904`

## One repaired outcome

Preserve A1 as shadow-only while making its already-required full PR unit oracle actually
merge-blocking and keeping every admitted implementation file inside the repository's physical-line
policy. A1 still removes no PR test. A2 remains the only future enforcement slice and remains
blocked until S3 proves zero misses, 100% unsafe fallback and measured gain.

## Deterministic blocker evidence

The approved A1 prototype is not PR-admissible as currently shaped:

1. `pnpm security:guard` fails because `.github/workflows/ci.yml` is 268 physical lines against its
   191-line legacy baseline and `scripts/ci/unit-shadow-test-owners.json` is a new 187-line file
   against the inclusive 150-line ceiling.
2. GitHub branch protection at this base requires `audit`, `e2e`, `pnpm-audit`, `gitleaks`,
   `pilot-gate`, `validation-surface`, `pr-finalizer` and `commitlint`; it does not require `unit`.
3. `scripts/pr-finalizer.sh` polls the same required set and does not poll `unit`. Therefore a
   standalone red `unit` job is not sufficient proof of the gate's normative claim that full PR
   unit remains required.

The repo-size synchronization approved by Arben is independent and exact: `maxTrackedBytes`
59,003,103; `maxTrackedFiles` 5,778; category ceilings docs/text 8,350,710, source/scripts
8,156,006, tests/e2e 6,240,358 and config/data/messages 2,008,721. It does not waive modularity.

## Minimal semantic repair

The A1 semantic writer map remains exactly the same 12 paths. No new writer or primitive is added.

- Refactor the owner manifest in place to a grouped, explicit owner/task/coverage schema. It must
  still enumerate all 25 workspaces, preserve QA=`check`, preserve taskless full fallback, and name
  only domain-case and domain-recovery as intentionally summaryless. Formatting remains readable;
  no minification or encoded owner table is allowed. The final file must be `<=150` physical lines.
- Refactor only A1 orchestration inside `.github/workflows/ci.yml`. The legacy workflow must be no
  larger than its 191-line base. Fold existing command lists only where the command order and exit
  semantics remain byte-auditable; do not compress YAML into unreadable one-line objects.
- Preserve the exact `Coverage Gate` command `pnpm coverage:gate`. Full coverage, explicit summary
  completeness and release-unit contracts run before selection. Shadow execution and receipt
  upload cannot mask the full result.
- Make the already-required `audit` context depend on the terminal full-unit result for broad PRs.
  `audit` may pass only when `validation-surface` is successful and either: the broad `unit` job is
  successful, or the unchanged certified quick-draft policy legitimately skipped `unit`. Failed,
  cancelled or missing broad-unit evidence must prevent `audit` success.
- Treat the CI workflow, not an individual job, as the admission's single shared runtime consumer.
  The internal `unit -> audit` edge is explicit closure evidence, not a second external consumer.
- Do not add `unit` to branch protection, modify finalizer code, create a repository variable, or
  mutate any provider setting. Required context names remain unchanged.

## Exact A1 semantic writers

1. `scripts/ci/unit-shadow-selector-lib.mjs`
2. `scripts/ci/unit-shadow-selector.mjs`
3. `scripts/ci/unit-shadow-runner.mjs`
4. `scripts/ci/unit-shadow-test-owners.json`
5. `scripts/ci/unit-shadow-selector.test.mjs`
6. `scripts/ci/unit-shadow-selector-cli.test.mjs`
7. `scripts/ci/unit-shadow-runner.test.mjs`
8. `scripts/ci/coverage-summary-contract.mjs`
9. `scripts/ci/z620-parity.json`
10. `scripts/ci/coverage-contracts.test.mjs`
11. `.github/workflows/ci.yml`
12. `.github/workflows/unit-nightly.yml`

Production, workflow, JSON and test files in this map must be `<=150` physical lines, except the
grandfathered `ci.yml`, which must be `<=191` and not grow. No governed 200-line test exception is
used. `coverage-gate.mjs` remains byte-identical.

## Governance lifecycle

R3 is a governance-only repair PR from exact base `7fb7180aafadf91b79ec37f5daeebaa85bc86ff2`.
Its only writers are:

1. `docs/plans/2026-08-21-ida-ci-dg01-a1-feasibility-repair-r3.md`;
2. `docs/plans/2026-08-21-ida-ci-pr-unit-shadow-a1-admission-v3.json`;
3. `docs/plans/current-program.md`;
4. `docs/plans/current-tracker.md`;
5. `scripts/repo-size-budget.json`, only if unchanged deterministic sync requires it.

The R3 merge leaves `awaiting_runtime_authority`, `runtime_authorized:false` and
`activeSlice:null`. The current R2 receipt and staged prototype remain provenance only and grant no
post-R3 runtime authority. After exact R3 main health, freeze
`docs/plans/2026-08-21-ida-ci-pr-unit-shadow-a1-runtime-receipt-r3.json` against the returned main.
Only separate byte-exact human approval of that receipt may transition A1 to
`active_implementation` and `runtime_authorized:true` in one fresh child/worktree/branch. No silent
rebase or transfer from the current implementation worktree is allowed.

R3 uses the parent's exact-SHA CD containment, main-health, cleanup, failure-closeout and successor
blocking rules. Any base drift before R3 materialization requires rebind and refreeze. Any R3 or A1
post-merge health, containment, cleanup, evidence or authority failure restores
`runtime_authorized:false`, `activeSlice:null`, blocks A1/A2 and stops for the already-defined
failure closeout. Cancellation is containment, never deployment authority.

## Acceptance additions

Before any R3 PR, prove formatting WRITE then CHECK, admission ready, JSON validity, occurrence and
secret scans, diff check, exact writer counts and no repo mutation outside the governance map.
Before any later A1 PR, require:

- `pnpm security:guard` green with manifest `<=150` and `ci.yml <=191`;
- workflow contracts proving full-first order, exact Coverage Gate command, required-audit closure,
  quick-draft preservation, summary completeness and artifact persistence;
- S1 focused selector/coverage tests green;
- S2 exact-head full-first shadow receipt with full suite still authoritative;
- S3 zero missed full-suite failures, 100% unsafe fallback and measured wall-time evidence.

Main, nightly and release stay full. Auth/shared-auth, RLS, security, release and CI contracts stay
required without duplicate unit execution. E2E, Pilot, finalizer, CodeQL, Sonar, cache, product,
auth, routing, tenancy, schema, billing, provider and OD17 semantics are unchanged.
