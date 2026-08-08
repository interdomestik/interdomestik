# IDA-DG19-B1-A1 — Repo-size metadata correction

Status: consolidated proposed authority correction; no mutation authority until Arben approves the exact bytes/SHA-256 and the correction is merged into repository authority.

Date: 2026-08-08

Parent authority: `IDA-DG19-B1-SAVED-DRAFT-CANONICAL-SUBMIT-RECUT`, 27,054 bytes, SHA-256 `7732e76cbe322faaa25177f15991d70c47a2e479907eac68cf2c91e261277db8`.

Approved parent runtime receipt: `IDA-UI03a2-B1-RUNTIME-RECEIPT`, 17,426 bytes, SHA-256 `eb1849880f1f6e0b8c509bdc882e8f6366ed033329f6164cd2071cbcd95766fc`. This correction suspends that runtime authority before any further product mutation because its exact eleven-path scope is no longer sufficient for mandatory repository gates. A fresh post-merge exact-main runtime receipt and exact-hash approval are required.

Preserved product candidate: branch `codex/ida-ui03a2-b1`, clean local head `cf71a502d2d5affb5a69e104e50a31df400c3b53`, based on `aa500f07ec011788d87364f5dc6398271b82bcad`; no push or product PR exists.

## Decision required

Authorize one and only one conditional deterministic support path:

`MOD_BY_UNCHANGED_GENERATOR scripts/repo-size-budget.json`

The parent gate's six production and five focused test/spec paths remain frozen and unchanged. The corrected total repository mutation set is exactly twelve paths only when the unchanged tracked-only generator proves drift. The twelfth path is inventory metadata, not product code, CI logic, infrastructure, documentation, a new user outcome or a second product slice.

No hand-edited budget value is authorized. The only writer is:

`node scripts/repo-size-budget-sync.mjs --tracked-only`

The command must change only `scripts/repo-size-budget.json`; `node scripts/repo-size-budget-sync.mjs --tracked-only --check` and `pnpm repo:size:check` must then pass. Any other changed path, generator change, discretionary reserve or larger-than-observed ceiling stops execution.

## Why the parent map is impossible as written

The current exact-main budget freezes `maxTrackedFiles` at 5,686. The approved parent map requires exactly three `NEW` test/action files, so the candidate has 5,689 tracked files. Byte compaction cannot lower a file-count metric. Removing or combining those files would violate the approved exact writer map and focused-test topology; deleting unrelated files would widen scope and corrupt repository authority.

Z620 exact-head R1 bound to `988107dc00f9bf52250096a81a07681f036b237c` showed:

- static pass: lint 43,937 ms, type-check 91,120 ms, entrypoints 870 ms, i18n 886 ms, i18n-purity 1,006 ms;
- database pass: migrate 6,740 ms and required RLS 57,135 ms on a task-owned disposable database;
- production web build pass in 457,854 ms;
- no E2E lane selected or completed;
- repo-size failure at 5,689 files versus 5,686, plus exact source/test byte drift;
- security modularity failure in two frozen test paths.

The modularity failure was remediated without scope growth: `create-from-saved-draft.test.ts` is now 150 lines and the legacy `submit.test.ts` is 382 lines versus 384 on base. Focused tests pass 16/16 and 9/9, `security:guard` passes, and the candidate was amended to `cf71a502d…`. That remediation invalidates the prior exact-head senior/security receipts and requires their bounded current-head rerun after authority is restored.

A temporary exact clone of `cf71a502d…` ran the unchanged generator and check successfully. The sole generated file is 359 bytes with SHA-256 `670ab8cd9eaadf035d52c6c6b5f3d802072f4d522e974d25794c6a56537f1b09`, containing only these inventory ceilings:

- `maxTrackedBytes`: 60,111,675;
- `maxTrackedFiles`: 5,689;
- `maxCategoryBytes.source/scripts`: 8,052,545;
- `maxCategoryBytes.tests/e2e`: 6,120,620;
- all other category, largest-file and source/test-line ceilings unchanged.

## Frozen user outcome

One eligible access-active member submits one complete saved vehicle or property Free Start draft through the existing canonical numbered-claim writer without retyping its six facts. The source draft remains separate and independently available. This correction adds no visible behavior and cannot alter that outcome.

## Frozen entry, transition and exit state

Entry:

- exact approved and merged parent gate;
- exact parent runtime approval now suspended by the discovered mandatory-path conflict;
- one fresh worktree and one writer;
- preserved clean product head `cf71a502d…`, not pushed;
- no product PR, provider call, deployment or production mutation;
- Z620 supporting evidence has zero completed E2E runs.

Transition:

1. Approve and merge only this docs authority correction.
2. Rerun AI OS check, repository preflight, resolver and workflow scorecard on exact new main.
3. Prepare one replacement runtime receipt binding the merged parent plus correction, the exact twelve-path maximum, new base, existing worktree/branch identity and current task; stop for Arben's exact-hash approval.
4. Rebase the preserved product commit onto exact new main without changing authored product behavior.
5. Run the unchanged tracked-only size generator once and verify that it changes only the conditional metadata path to the exact observed inventory.
6. Rerun only evidence invalidated by the new head or prior classified failures: focused affected tests, modularity/security, repo-size, validation with verified base SHA, the four classified Z620 lanes, bounded Opus 5 current-head review, current-head security diff scan and downstream PR gates.
7. Continue the already-authorized single-slice PR/CI/review/merge/closeout lifecycle. Exactly one full E2E may complete, in CI on the final reviewed PR head.

Exit:

- the same one user-visible transition is implemented;
- exactly six production, five focused test/spec and one deterministic metadata path are changed;
- all mandatory gates pass on one exact reviewed head;
- no second product slice starts;
- closeout returns clean synced main and `blocked_requires_current_authority`, `activeSlice=null`.

## Exact writer map

Production — unchanged, exactly six:

1. `apps/web/src/actions/claims/create-from-saved-draft.ts`
2. `apps/web/src/actions/claims/submit.core.ts`
3. `packages/domain-claims/src/claims/submit.ts`
4. `apps/web/src/components/claims/claim-draft-intake/index.tsx`
5. `apps/web/src/components/claims/claim-draft-intake/main-panel.tsx`
6. `apps/web/src/components/claims/claim-draft-intake/dormant-preview.tsx`

Focused tests/spec — unchanged, exactly five:

1. `apps/web/src/actions/claims/create-from-saved-draft.test.ts`
2. `packages/domain-claims/src/claims/submit.test.ts`
3. `apps/web/src/components/claims/claim-draft-intake/saved-draft-submit.test.tsx`
4. `apps/web/src/components/claims/claim-draft-intake/claim-draft-intake.boundary.test.ts`
5. `apps/web/e2e/gate/member-claim-draft-intake.spec.ts`

Conditional deterministic support metadata — exactly one:

1. `scripts/repo-size-budget.json`, modified only by the unchanged tracked-only generator and only because the eleven authored paths exceed exact-main inventory.

## Exclusions

All parent exclusions remain binding. In particular, this correction does not authorize:

- a thirteenth path, a generator/script/workflow change, CI or Z620 infrastructure work;
- hand-edited size values, reserve, rounding, ignored/untracked inventory or relaxed modularity limits;
- route/proxy, auth/session, tenancy, schema, migration, RLS, generic idempotency, claim-number, locale/message, provider, upload or deployment changes;
- reopening completed IDA-UI06a, IDA-UI06b, IDA-UI03b, IDA-UI03a2-P0a2a or PR #1514;
- Hero redesign, membership dashboard redesign, source-to-claim linkage or post-submit source-state claims;
- treating Brain, Wiki, review or generated metadata as product authority;
- Mac Docker, Mac heavy build/E2E, more than one completed full CI E2E or production mutation.

## Acceptance evidence

Before product PR push, all of the following must bind the same current head:

1. Exact changed-path audit equals the twelve-path maximum and no protected path is touched.
2. Both touched test files satisfy the real modularity guard; all other authored files remain within parent line budgets.
3. Focused server-action, domain and component tests pass; the boundary spec remains green.
4. `pnpm security:guard` passes.
5. The unchanged size generator reports no drift after its sole deterministic write and `pnpm repo:size:check` passes.
6. Z620 validation receives verified base SHA; passing static, DB/RLS and build evidence is rerun only if the rebase or new head invalidates it.
7. The four untouched OTP coverage failures remain classified as resource-run environment failures unless current-head CI reproduces them with its canonical Upstash test configuration; reproduction is a separate stop, not a reason to modify OTP surfaces here.
8. Bounded Opus 5 current-head review returns no blocker after the substantive test remediation; no duplicate request while it is running.
9. Current-head security diff scan, Copilot review, Sonar, CodeQL, security, feedback intake and finalizer are terminal and classified.
10. Exactly one full E2E completes in CI on the final reviewed PR head; no local or duplicate full E2E is run.

## Highest-risk cases

- Metadata laundering: the budget could hide unrelated growth. Mitigation: exact twelve-path audit, unchanged generator, observed-value-only output and no reserve.
- Authority drift: the existing runtime receipt names an eleven-path map. Mitigation: suspend it now; merge this correction and require a replacement exact-main receipt before any product mutation.
- Stale review: line-limit remediation changed the candidate head. Mitigation: rerun the bounded senior and security reviews only after the final metadata/rebase head is frozen.
- Environment false negative: validation lacked a base and OTP coverage lacked canonical test configuration. Mitigation: pass the verified base explicitly and let canonical CI decide the untouched OTP surface; do not patch unrelated code.
- E2E overrun: diagnostic Z620 lanes could consume the sole full run. Mitigation: keep Z620 selection free of E2E; reserve one full run for final-head CI.

## Rollback

Before product merge, abandon this correction and the preserved branch/worktree; no runtime, database, provider or production state exists. After product merge, one revert of the product merge removes the eleven authored paths/deltas and restores the previous deterministic budget bytes in the same revert. No schema, migration, RLS, data backfill or provider rollback is required. The authority correction document itself may remain historical; it grants no successor authority.

## Stop conditions

Stop immediately if:

- Arben does not approve this exact artifact or repository authority does not merge it;
- the replacement runtime receipt is not exact-approved;
- the generator changes any path other than `scripts/repo-size-budget.json`, emits values beyond exact tracked inventory or changes its own bytes;
- any thirteenth path is needed;
- rebase changes product semantics or cannot preserve the frozen user outcome;
- the current-head modularity, security, repo-size, focused, reviewer or CI gates cannot pass without widening scope;
- canonical CI reproduces the OTP failures under its normal configuration;
- another full E2E completes before the final reviewed-head CI run;
- provider/deploy effects cannot be contained before execution.

Candidate disposition: `NO_GO_UNTIL_EXACT_APPROVAL_AND_REPO_AUTHORITY_MERGE`.
