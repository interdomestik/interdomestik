# GA03 Sponsored Seat Activation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add sponsored-seat activation and the first self-upgrade path from sponsored `standard` coverage to `family` coverage on the canonical member membership surface.

**Architecture:** Keep the current route and auth model intact. Represent sponsored seats using the existing subscription record, with agent import creating a paused sponsored subscription and member-side activation flipping that same row to active. Surface activation and self-upgrade actions from the existing membership operations UI.

**Tech Stack:** Next.js App Router, React 19, TypeScript, server actions, Drizzle ORM, Vitest, Testing Library.

---

## Chunk 1: Sponsored Import State

### Task 1: Lock sponsored import semantics with failing tests

**Files:**

- Modify: `apps/web/src/lib/actions/agent/import-members.core.test.ts`
- Modify: `apps/web/src/lib/actions/agent/register-member.wrapper.test.ts`
- Modify: `apps/web/src/lib/actions/agent.test.ts`

- [ ] **Step 1: Write the failing test**
      Add tests that prove roster import creates sponsored seats rather than immediately activated consumer memberships.

- [ ] **Step 2: Run test to verify it fails**
      Run: `pnpm --filter @interdomestik/web test:unit --run src/lib/actions/agent/import-members.core.test.ts`
      Expected: FAIL because sponsored import metadata and paused status do not exist yet.

- [ ] **Step 3: Write minimal implementation**
      Thread a sponsored-import mode through the agent import core and registration write path.

- [ ] **Step 4: Run test to verify it passes**
      Run the same test again and confirm PASS.

- [ ] **Step 5: Commit**
      Commit the import-state slice once green.

## Chunk 2: Sponsored Activation Action

### Task 2: Add the member-side activation contract

**Files:**

- Modify: `apps/web/src/actions/subscription.core.ts`
- Create or Modify: `apps/web/src/actions/subscription.core.test.ts`
- Modify: `apps/web/src/components/ops/adapters/membership.ts`
- Modify: `apps/web/src/components/ops/adapters/membership.test.ts`

- [ ] **Step 1: Write the failing test**
      Add tests that prove only paused sponsored subscriptions can be activated and that activation stamps a one-year active period.

- [ ] **Step 2: Run test to verify it fails**
      Run: `pnpm --filter @interdomestik/web test:unit --run src/actions/subscription.core.test.ts`
      Expected: FAIL because no sponsored activation action exists yet.

- [ ] **Step 3: Write minimal implementation**
      Add the authenticated activation server action and the action adapter surface for the membership UI.

- [ ] **Step 4: Run test to verify it passes**
      Run the targeted action tests again and confirm PASS.

- [ ] **Step 5: Commit**
      Commit after the activation contract is green.

## Chunk 3: Membership UI States

### Task 3: Render activation and family self-upgrade states on `/member/membership`

**Files:**

- Modify: `apps/web/src/features/member/membership/components/MembershipOpsPage.tsx`
- Modify: `apps/web/src/features/member/membership/components/MembershipOpsPage.test.tsx`
- Modify: `apps/web/src/app/[locale]/(app)/member/membership/page.test.tsx`

- [ ] **Step 1: Write the failing test**
      Add UI tests for paused sponsored seats, active sponsored standard seats, and non-sponsored subscriptions.

- [ ] **Step 2: Run test to verify it fails**
      Run: `pnpm --filter @interdomestik/web test:unit --run src/features/member/membership/components/MembershipOpsPage.test.tsx`
      Expected: FAIL because the sponsored activation and upgrade cards do not render yet.

- [ ] **Step 3: Write minimal implementation**
      Render sponsored activation and family-upgrade cards while preserving the existing operations layout and coverage matrix.

- [ ] **Step 4: Run test to verify it passes**
      Run the targeted UI tests again and confirm PASS.

- [ ] **Step 5: Commit**
      Commit when the member UI states are green.

## Chunk 4: Planning Artifacts And Full Verification

### Task 4: Advance the live planning docs and verify the slice

**Files:**

- Modify: `docs/plans/current-program.md`
- Modify: `docs/plans/current-tracker.md`
- Reference: `docs/plans/2026-03-09-interdomestik-business-model-blueprint-v1.md`
- Reference: `docs/plans/2026-03-09-blueprint-roadmap-diff-proposal.md`

- [ ] **Step 1: Write the failing test**
      No direct code test; stale planning state is the failure condition.

- [ ] **Step 2: Run test to verify it fails**
      Not applicable.

- [ ] **Step 3: Write minimal implementation**
      Mark `GA03` complete, promote the next committed `P4G` item, and record proof references.

- [ ] **Step 4: Run test to verify it passes**
      Run:
      `pnpm plan:status`
      `pnpm plan:audit`
      `pnpm security:guard`
      `pnpm e2e:gate`
      `pnpm pr:verify`

- [ ] **Step 5: Commit**
      Commit the completed `GA03` slice after all verification passes.
