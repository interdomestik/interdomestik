# GA02 Aggregate Group Dashboard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add the first aggregate-only `GA02` dashboard to the office-tier `/agent/import` surface so sponsored-portfolio operators can see activations, usage, and SLA-safe aggregate case metrics without exposing claim facts, notes, or documents.

**Architecture:** Keep the existing canonical route and auth model intact. Extend the `/agent/import` page with an office-tier-gated server read model that aggregates the current agent-managed portfolio created by `GA01`, then render those metrics above the existing CSV import surface. No new portal, tenancy path, or sponsor entity is introduced in this slice.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Drizzle ORM, Vitest, existing auth/session helpers, existing SLA helpers.

---

### Task 1: Lock the aggregate read-model contract with failing tests

**Files:**

- Create: `apps/web/src/features/agent/import/server/get-group-dashboard-summary.test.ts`
- Modify: `apps/web/src/app/[locale]/(agent)/agent/_core.test.ts`
- Reference: `apps/web/src/features/claims/policy/slaPolicy.ts`

**Step 1: Write the failing test**

Add tests that assert the new read model:

- counts activated members from active agent-managed subscriptions
- computes usage rate from active subscriptions with any recorded service usage
- aggregates open-claim statuses into SLA-safe counts (`running`, `incomplete`, `notApplicable`, `breached`)
- returns all-zero metrics when the portfolio is empty

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @interdomestik/web test:unit --run src/features/agent/import/server/get-group-dashboard-summary.test.ts`

Expected: FAIL because the new server read model does not exist yet.

**Step 3: Write minimal implementation**

Create a server read model that:

- scopes all reads by `tenantId` and `agentId`
- reads active `subscriptions.agentId`
- derives `membersUsingBenefitsCount` from `service_usage`
- derives SLA-phase counts from claim statuses using `deriveClaimSlaPhase`

**Step 4: Run test to verify it passes**

Run the same unit test and confirm it passes.

**Step 5: Commit**

Commit once the read-model contract is green together with its implementation.

### Task 2: Add office-tier route gating and server page coverage

**Files:**

- Create: `apps/web/src/app/[locale]/(dashboard)/agent/import/page.test.ts`
- Modify: `apps/web/src/app/[locale]/(dashboard)/agent/import/page.tsx`
- Reference: `apps/web/src/app/[locale]/(agent)/agent/_layout.core.ts`

**Step 1: Write the failing test**

Add page tests that assert:

- unauthenticated or non-agent access redirects away from `/agent/import`
- non-office agents get `notFound()`
- office agents render the aggregate dashboard shell and the uploader surface together

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @interdomestik/web test:unit --run 'src/app/[locale]/(dashboard)/agent/import/page.test.ts'`

Expected: FAIL because the route currently checks role only and does not render the new aggregate summary.

**Step 3: Write minimal implementation**

Update the page to:

- resolve `tenantId` safely from session
- load the agent tier through the existing core helper
- gate the route to `office`
- load the aggregate summary on the server and pass it into the page UI

**Step 4: Run test to verify it passes**

Run the page test again and confirm it passes.

**Step 5: Commit**

Commit after the route gate and page integration are green.

### Task 3: Render the aggregate-only dashboard UI above the import flow

**Files:**

- Create: `apps/web/src/features/agent/import/components/group-dashboard-summary.tsx`
- Create: `apps/web/src/features/agent/import/components/group-dashboard-summary.test.tsx`
- Modify: `apps/web/src/app/[locale]/(dashboard)/agent/import/page.tsx`

**Step 1: Write the failing test**

Add component tests that assert the UI shows:

- activated members
- usage rate with numerator and denominator
- open case count
- SLA aggregate chips/cards only
- an explicit privacy boundary statement that no claim facts or documents are shown

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @interdomestik/web test:unit --run src/features/agent/import/components/group-dashboard-summary.test.tsx`

Expected: FAIL because the component does not exist yet.

**Step 3: Write minimal implementation**

Render a simple server-safe summary component using the read-model DTO. Keep the existing CSV import section intact below the summary.

**Step 4: Run test to verify it passes**

Run the component test again and confirm it passes.

**Step 5: Commit**

Commit after the aggregate-only UI is green.

### Task 4: Advance the live planning artifacts and verify the full slice

**Files:**

- Modify: `docs/plans/current-program.md`
- Modify: `docs/plans/current-tracker.md`
- Reference: `docs/plans/2026-03-09-interdomestik-business-model-blueprint-v1.md`
- Reference: `docs/plans/2026-03-09-blueprint-roadmap-diff-proposal.md`

**Step 1: Write the failing test**

No code test for the planning docs. Treat the proof requirement as the blocking verification surface.

**Step 2: Run test to verify it fails**

Not applicable. The failure condition is stale planning state with `GA01` still pending and `GA02` not yet promoted.

**Step 3: Write minimal implementation**

Update the live plan/tracker to:

- mark `GA01` complete with proof references
- promote `GA02` to the next committed `P4G` item
- record the new implementation proof paths

**Step 4: Run test to verify it passes**

Run:

- `pnpm plan:status`
- `pnpm plan:audit`
- `pnpm security:guard`
- `pnpm e2e:gate`
- `pnpm pr:verify`

Expected: all pass with the new `GA02` slice in place.

**Step 5: Commit**

Commit the full `GA02` slice and updated planning artifacts once all verification passes.
