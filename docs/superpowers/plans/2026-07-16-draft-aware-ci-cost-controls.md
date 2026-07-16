# Draft-Aware CI Cost Controls Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make heavy PR gates draft-aware while preserving current-head Phase C merge evidence.

**Architecture:** A small pure policy classifies each PR as quick or full. Heavy workflows consume that policy through lightweight preflights, while stable wrapper/check names preserve branch protection. The PR finalizer becomes the current-head attestation for full-gate-eligible PRs.

**Tech Stack:** GitHub Actions YAML, Node.js ESM policy scripts, Node test runner, Bash finalizer, pnpm.

---

## Chunk 1: Policy And Contracts

### Task 1: Add the PR gate policy with TDD

**Files:**

- Create: `scripts/ci/pr-gate-policy-lib.mjs`
- Create: `scripts/ci/pr-gate-policy.mjs`
- Create: `scripts/ci/pr-gate-policy.test.mjs`

- [ ] Write failing tests for ordinary draft, ready PR, `full-gate` label,
      high-risk draft, missing evidence, and non-PR event behavior.
- [ ] Run `node --test scripts/ci/pr-gate-policy.test.mjs` and confirm RED.
- [ ] Implement the smallest pure evaluator and CLI output contract.
- [ ] Rerun the focused test and confirm GREEN.
- [ ] Keep both production files under 150 lines.

### Task 2: Write failing workflow contracts

**Files:**

- Modify: `scripts/ci/workflow-contracts.test.mjs`
- Modify: `scripts/ci/pr-finalizer-workflow.test.mjs`
- Modify: `scripts/ci/github-pr-finalizer-contracts.test.mjs`

- [ ] Add assertions for explicit PR event types and policy evaluation.
- [ ] Add assertions for draft quick lanes and full runner/wrapper contracts.
- [ ] Assert finalizer current-head polling and the eight live required checks.
- [ ] Run the focused contract tests and confirm RED for missing behavior.

## Chunk 2: Workflow Implementation

### Task 3: Make CI draft-aware

**Files:**

- Modify: `.github/workflows/ci.yml`

- [ ] Add `ready_for_review`, `converted_to_draft`, and `labeled` triggers.
- [ ] Evaluate gate policy in `validation-surface`.
- [ ] Compute an effective heavy decision where high-risk/label overrides the
      non-product-only optimization.
- [ ] Keep `audit` materialized with a quick draft step and condition heavy
      setup/audits on the effective decision.
- [ ] Gate static, unit, AI eval, and CI RLS lanes on the effective decision.

### Task 4: Split PR E2E into preflight, runner, and stable wrapper

**Files:**

- Modify: `.github/workflows/e2e-pr.yml`
- Modify: `scripts/ci/workflow-contracts.test.mjs`

- [ ] Move policy/surface classification to `e2e-preflight`.
- [ ] Keep Postgres and Playwright only in `e2e-runner`.
- [ ] Preserve the required `e2e` wrapper name and fail it when eligible heavy
      work does not succeed.
- [ ] Update credential-order and E2E workflow contracts.

### Task 5: Gate Pilot and deterministic backstops

**Files:**

- Modify: `.github/workflows/pilot-gate.yml`
- Modify: `.github/workflows/pr-deterministic-backstops.yml`

- [ ] Add policy evaluation and effective decision to Pilot preflight.
- [ ] Keep the stable `pilot-gate` wrapper contract.
- [ ] Add a lightweight backstop policy job and condition all expensive jobs on
      `run_full=true`.

### Task 6: Make finalizer attest the current full head

**Files:**

- Modify: `.github/workflows/pr-finalizer.yml`
- Modify: `scripts/pr-finalizer.sh`
- Modify: finalizer contract tests from Task 2.

- [ ] Evaluate gate policy in the workflow.
- [ ] Skip expensive finalization for ordinary drafts.
- [ ] Set `PR_FINALIZER_SKIP_CHECK_POLLING=false` for full-eligible runs.
- [ ] Match required checks to branch protection: validation-surface, audit,
      e2e, pilot-gate, pnpm-audit, gitleaks, pr-finalizer, commitlint.
- [ ] Rerun focused contract tests and confirm GREEN.

## Chunk 3: Verification And Delivery

### Task 7: Focused and structural verification

- [ ] Run policy and workflow contract tests.
- [ ] Run YAML parsing/permission/security workflow contracts.
- [ ] Run `pnpm test:ci:contracts`.
- [ ] Run `pnpm check:modularity-guard` and `git diff --check`.
- [ ] Run the Interdomestik scope audit with protected runtime paths forbidden.

### Task 8: Full Phase C verification

- [ ] Run AI OS heavy-job preflight before RAM-heavy commands.
- [ ] Run `pnpm slice:verify`.
- [ ] Run `pnpm ci:local:pr` and classify environment/resource blockers exactly.
- [ ] Run `pnpm pr:verify`.
- [ ] Run `pnpm security:guard`.
- [ ] Run `pnpm e2e:gate`.

### Task 9: GitHub delivery proof

- [ ] Create the `full-gate` repository label if absent.
- [ ] Commit the scoped change and push `codex/ci-draft-gates`.
- [ ] Open one draft PR and verify high-risk-path force-full on the current head;
      this implementation PR cannot exercise quick mode because it changes CI.
- [ ] Verify ordinary-draft quick mode with deterministic local event fixtures.
- [ ] If the implementation is later merged with explicit user approval, use a
      disposable non-high-risk draft PR to prove the remote quick lane, then
      close it without merging and delete its branch.
- [ ] Apply/remove `full-gate` on a non-high-risk verification PR only when that
      post-merge proof is authorized; the implementation PR is already force-full.
- [ ] Mark the implementation PR ready and verify all required current-head checks.
- [ ] Request one final Copilot review only, per the user-approved cost override.
- [ ] Do not merge until the user explicitly approves the PR outcome.
