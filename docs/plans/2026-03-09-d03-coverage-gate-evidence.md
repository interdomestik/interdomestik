---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-03-09
---

# D03 Coverage Gate Evidence

> Status: Active supporting input. This document records the code and verification evidence for `D03` blocking repository coverage enforcement inside `P-1` Infrastructure Debt Closure.

## Scope

`D03` required one narrow outcome:

- make repository line coverage a blocking CI condition with a 60% floor, enforced through the canonical verification surface instead of a side-channel report

## Code Evidence

- root verification scripts now clean stale coverage artifacts, emit deterministic `json-summary` coverage data, and enforce the 60% repository floor in [package.json](../../package.json)
- the repository coverage aggregator and stale-artifact cleanup scripts now live in [scripts/ci/coverage-gate.mjs](../../scripts/ci/coverage-gate.mjs) and [scripts/ci/clean-coverage-artifacts.mjs](../../scripts/ci/clean-coverage-artifacts.mjs)
- CI contract coverage now asserts the blocking coverage floor and package-script wiring in [scripts/ci/coverage-contracts.test.mjs](../../scripts/ci/coverage-contracts.test.mjs)
- the canonical CI workflow now runs the blocking coverage gate in the unit lane, with workflow enforcement covered in [scripts/ci/workflow-contracts.test.mjs](../../scripts/ci/workflow-contracts.test.mjs) and [.github/workflows/ci.yml](../../.github/workflows/ci.yml)
- the newly exposed workspace-resolution gap in the domain coverage lane is fixed in [packages/domain-claims/vitest.config.ts](../../packages/domain-claims/vitest.config.ts), allowing `domain-claims` tests to resolve `@interdomestik/domain-ai` and `@interdomestik/database` consistently during coverage runs

## Red-Green Evidence

The initial red contract run on 2026-03-09 was:

- `node --test scripts/ci/coverage-contracts.test.mjs scripts/ci/workflow-contracts.test.mjs`

That red run failed for the expected reasons:

- `scripts/ci/coverage-gate.mjs` did not exist yet
- `package.json` did not expose the cleanup, gate, or `pr:verify` wiring
- `.github/workflows/ci.yml` did not run a blocking coverage step in the unit lane

The first real coverage execution then surfaced a hidden resolver defect:

- `pnpm coverage:gate`

That run failed inside `packages/domain-claims` because `src/claims/ai-workflows.test.ts` could not resolve `@interdomestik/domain-ai` during the workspace coverage run. A focused repro confirmed the issue:

- `pnpm --filter @interdomestik/domain-claims test:unit --run src/claims/ai-workflows.test.ts`

After adding the Vitest workspace aliases in `packages/domain-claims/vitest.config.ts`, the focused repro passed and the full repository gate turned green.

The following green checks passed after the implementation:

- `node --test scripts/ci/coverage-contracts.test.mjs scripts/ci/workflow-contracts.test.mjs`
- `pnpm --filter @interdomestik/domain-claims test:unit --run src/claims/ai-workflows.test.ts`
- `pnpm coverage:gate`
- `pnpm test:ci:contracts`
- `pnpm plan:status`
- `pnpm plan:audit`
- `pnpm security:guard`
- `pnpm e2e:gate`
- `pnpm pr:verify`

The blocking coverage result from the final green run was:

- repository line coverage `76.23%` (`5449/7148`), above the enforced `60.00%` floor

## Notes

- the coverage gate intentionally aggregates workspace `coverage-summary.json` outputs for `apps/web` plus `packages/domain-*`, so the enforced percentage reflects the actual repository verification lane instead of a single-package number
- stale coverage directories are deleted before every run to prevent old reports from affecting the aggregate percentage
- the domain-claims resolver failure was pre-existing but hidden because the prior canonical verification surface did not execute the full domain coverage lane

## Conclusion

`D03` is complete for code and local verification evidence.

The remaining live `P-1` queue is now `D04` through `D08`.
