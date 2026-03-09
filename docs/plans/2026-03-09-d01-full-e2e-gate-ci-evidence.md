---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-03-09
---

# D01 Full E2E Gate CI Evidence

> Status: Active supporting input. This document records the code and verification evidence for `D01` full PR `e2e:gate` CI work inside `P-1` Infrastructure Debt Closure.

## Scope

`D01` required three outcomes:

- promote `P-1` Infrastructure Debt Closure into the live `current-program.md` and `current-tracker.md` control docs
- replace the PR browser smoke-plus-single-golden split with the canonical full `pnpm e2e:gate` lane while preserving validation-surface and strict-rule guard behavior
- clear the existing standalone-build blocker discovered during verification so the repository’s real gate commands can complete

## Code Evidence

- live program promotion in [current-program.md](./current-program.md) and [current-tracker.md](./current-tracker.md)
- PR E2E workflow now runs `Run Full E2E Gate` in [e2e-pr.yml](../../.github/workflows/e2e-pr.yml)
- CI workflow contract updated in [workflow-contracts.test.mjs](../../scripts/ci/workflow-contracts.test.mjs)
- workspace-resolution regression test added in [workspace-resolution-contracts.test.mjs](../../scripts/ci/workspace-resolution-contracts.test.mjs)
- `apps/web` build configuration now includes the AI workspace dependency in [next.config.mjs](../../apps/web/next.config.mjs) and [tsconfig.json](../../apps/web/tsconfig.json)

## Focused Verification Evidence

The following focused checks passed on 2026-03-09:

- `node --test scripts/ci/workflow-contracts.test.mjs`
- `node --test scripts/ci/workspace-resolution-contracts.test.mjs`
- `pnpm test:ci:contracts`
- `pnpm plan:audit`
- `pnpm plan:status`

## Required Gate Evidence

The required repository gates also passed on 2026-03-09:

- `pnpm security:guard`
- `pnpm pr:verify`
- `pnpm e2e:gate`

## Notes

- `pnpm pr:verify` initially exposed a pre-existing standalone build failure: `apps/web` could not resolve `@interdomestik/domain-ai` while rebuilding the production artifact used by Playwright.
- The minimal root-cause fix was to align `apps/web` workspace resolution with the already-transpiled domain packages by adding `@interdomestik/domain-ai` to `transpilePackages` and the app-level TypeScript path/include contract.

## Conclusion

`D01` is complete for code and local verification evidence.

`P-1` is now the live post-`AI06` tranche, with `D02` through `D08` remaining pending in the canonical tracker.
