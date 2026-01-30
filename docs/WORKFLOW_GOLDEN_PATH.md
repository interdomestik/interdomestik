# Interdomestik V2: The Golden Path Workflow

This document defines the high-discipline workflow for Interdomestik V2. It bridges the gap between raw features and the **Delivery Contract**.

## 1. The Planning Phase (Spec First)

Every feature starts with a Design Specification.

1. **Brainstorm**: Explore the intent and constraints.
2. **Design**: Write a spec to `docs/plans/YYYY-MM-DD-<name>-design.md`.
3. **Plan**: Break the design into TDD tasks in `docs/plans/YYYY-MM-DD-<name>-implementation.md`.

## 2. The Development Phase (TDD Cycle)

Never write implementation code without a failing test.

1. **RED**: Write a unit test in `_core.test.ts` or a Playwright spec.
2. **GREEN**: Implement minimal code to pass.
3. **REFACTOR**: Polish for performance and readability.
4. **COMMIT**: Use Conventional Commits.
   ```bash
   git commit -m "feat(member): implement matte-anchor-card lift logic"
   ```

## 3. The Hardening Phase (Contract Verification)

Before opening a PR, you must pass the **Quad-Gate Verification**:

1. **Purity Gate**: `pnpm purity:audit` (Enforces Core Purity).
2. **Contract Gate**: `pnpm track:audit` (Enforces architectural invariants).
3. **Safety Gate**: `pnpm type-check && pnpm lint` (Enforces runtime integrity).
4. **Logic Gate**: `pnpm test` (Enforces business correctness).

## 4. The Reconciliation Phase (GitOps Logic)

Treat your Plan file as the "Desired State".

1. Update the Implementation Plan with the **Commit SHA** for every completed task.
2. Ensure the plan reflects any **Deviations** encountered during coding.

## 5. The Delivery Phase (Release Hardening)

Once the "Orchestration Slice" is complete:

1. Run `pnpm release:dry` to verify the versioning.
2. Merge to `main`.
3. `release-it` generates the changelog and tags the release as `hardened`.

---

## Reasoning: Why this works?

- **Zero Entropy**: By forcing `track:audit` on every commit, we prevent architectural drift.
- **Traceability**: Linking SHAs to tasks in the plan ensures we know _why_ every line of code exists.
- **Confidence**: The Quad-Gate ensures that if the CI is green, the product is production-ready.
