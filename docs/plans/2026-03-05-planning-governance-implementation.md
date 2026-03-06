---
plan_role: input
status: archived
source_of_truth: false
owner: platform
last_reviewed: 2026-03-05
---

# Planning Governance Implementation Plan

> Status: Historical implementation plan for the planning-governance rollout.

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Establish one authoritative execution plan in-repo and enforce it with a lightweight audit.

**Architecture:** Add a canonical current program document and current tracker, mark historical planning inputs with explicit governance metadata, and enforce the policy with a script that checks for exactly one active canonical plan, one active tracker, and one active execution log.

**Tech Stack:** Markdown, Node.js, pnpm, GitHub Actions

---

### Task 1: Add the governance policy document

**Files:**

- Create: `docs/plans/planning-governance-policy.md`

**Steps:**

1. Define the canonical artifact model: `canonical_plan`, `tracker`, `execution_log`, `input`.
2. Define required front matter fields and allowed statuses.
3. Define change-control rules so assessment docs cannot become live plans.
4. Document the audit command and CI expectation.

### Task 2: Create the canonical current plan and tracker

**Files:**

- Create: `docs/plans/current-program.md`
- Create: `docs/plans/current-tracker.md`

**Steps:**

1. Merge the active priorities from the March charter and unresolved bulletproof work.
2. State the authority rule clearly at the top of both files.
3. Separate committed work from recommendation/backlog inputs.

### Task 3: Add metadata banners to legacy planning docs

**Files:**

- Modify: `docs/plans/2026-02-22-v1-bulletproof-tracker.md`
- Modify: `docs/plans/2026-03-03-program-charter-canonical.md`
- Modify: `docs/plans/2026-03-03-advisory-foundation-addendum.md`
- Modify: `docs/plans/2026-03-03-implementation-conformance-log.md`
- Modify: `docs/MATURITY_ASSESSMENT_2026.md`
- Modify: `docs/EXECUTIVE_MATURITY_ASSESSMENT.md`

**Steps:**

1. Add front matter with `plan_role`, `status`, `source_of_truth`, and `superseded_by` where required.
2. Add a short status banner under the front matter so humans see the governance state immediately.

### Task 4: Implement policy enforcement

**Files:**

- Create: `scripts/plan-audit.mjs`
- Create: `scripts/plan-audit.test.mjs`
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`

**Steps:**

1. Parse governed markdown files with front matter.
2. Fail if the repo has anything other than one active canonical plan, one active tracker, and one active execution log.
3. Fail if superseded docs omit `superseded_by`.
4. Add a `pnpm plan:audit` command and run it in CI.

### Task 5: Verify the policy

**Steps:**

1. Run `node --test scripts/plan-audit.test.mjs`.
2. Run `pnpm plan:audit`.
3. Confirm the worktree is clean except for intended changes.
