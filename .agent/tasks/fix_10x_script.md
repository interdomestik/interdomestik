# Implementation Plan: Fix 10x Task Script and Baseline Results

The objective is to fix the `start-10x-task.sh` script to ensure it runs reliably in both interactive and non-interactive (agent) environments, and to resolve current unit test failures that are blocking a clean baseline capture.

## 1. Fix `start-10x-task.sh`

### 1.1 Speed up Prettier Check

- Modify `FORMAT_CMD` to target only `apps/web` and `packages/` to avoid checking everything.
- Add `--ignore-path .gitignore` to ensure it follows git rules.
- Add `--cache` to speed up subsequent runs.

### 1.2 Improve Interactivity & Defaults

- Ensure `NON_INTERACTIVE` mode works perfectly.
- Default to `P1-High` priority and `Feature` type if not provided in non-interactive mode.

### 1.3 Baseline Robustness

- Add a timeout or more focused grep for finding failure info in test logs.

## 2. Fix Unit Test Failures (`claims.test.ts`)

### 2.1 Update DB Mocks

- Add `subscriptions` search to the database query mock in `apps/web/src/actions/claims.test.ts` to satisfy the new "Membership Gate" in `submitClaim`.
- Ensure `findFirst` for subscriptions returns a mock active subscription by default.

## 3. Verify

- Run `NON_INTERACTIVE=1 ./scripts/start-10x-task.sh "Verification Task"` and ensure it completes successfully and creates the task file.
- Confirm unit tests pass.
- Confirm Prettier check is faster.

---

**Done Criteria**:

- [x] `start-10x-task.sh` completes without hanging or crashing.
- [x] `claims.test.ts` passes.
- [x] Baseline capture in the script reports "pass" for all sections.
