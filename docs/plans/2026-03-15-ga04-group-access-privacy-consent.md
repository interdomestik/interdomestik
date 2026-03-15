# GA04 Group Access Privacy And Consent Negative Tests

> **For agentic workers:** REQUIRED: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Keep the office-tier group-access dashboard provably aggregate-only so group admins cannot see claim facts, internal notes, or claim documents without explicit member consent.

**Architecture:** Preserve the current `/agent/import` route, office-tier gate, and aggregate-only read model. `GA04` adds negative-test coverage around that existing contract rather than introducing a new detail surface. The only production change in scope is copy hardening that makes the privacy-and-consent boundary explicit on the aggregate dashboard.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Vitest, Playwright, Drizzle ORM, existing seeded E2E fixtures.

---

## Chunk 1: Lock The Aggregate Privacy Contract

### Task 1: Add failing unit and page tests for the privacy boundary

**Files:**

- Modify: `apps/web/src/features/agent/import/server/get-group-dashboard-summary.test.ts`
- Modify: `apps/web/src/features/agent/import/components/group-dashboard-summary.test.tsx`
- Modify: `apps/web/src/app/[locale]/(dashboard)/agent/import/page.test.tsx`

- [ ] **Step 1: Write the failing test**
      Add assertions that the aggregate summary contract does not expose member identifiers, raw claim rows, internal notes, or document lists, and that the dashboard copy states the explicit consent boundary.

- [ ] **Step 2: Run test to verify it fails**
      Run:
      `pnpm --filter @interdomestik/web test:unit --run src/features/agent/import/server/get-group-dashboard-summary.test.ts`
      `pnpm --filter @interdomestik/web test:unit --run src/features/agent/import/components/group-dashboard-summary.test.tsx`

- [ ] **Step 3: Write minimal implementation**
      Keep the server DTO aggregate-only and harden the UI copy so it states that claim facts, notes, and documents remain hidden without explicit member consent.

- [ ] **Step 4: Run test to verify it passes**
      Re-run the targeted unit tests and confirm PASS.

- [ ] **Step 5: Commit**
      Commit once the privacy contract is green.

## Chunk 2: Add Office-Tier E2E Proof

### Task 2: Add a negative gate spec for office-tier group access

**Files:**

- Create: `apps/web/e2e/gate/group-access-privacy-consent.spec.ts`
- Modify: `apps/web/e2e/routes.ts`
- Reference: `apps/web/e2e/utils/seeded-claim-context.ts`

- [ ] **Step 1: Write the failing test**
      Add a gate that temporarily promotes the seeded E2E agent to `office`, injects a staff-only internal note plus a claim document on a seeded member claim, opens `/agent/import`, and proves the page still exposes only aggregate metrics and no seeded member name, claim text, internal note text, or document file name.

- [ ] **Step 2: Run test to verify it fails**
      Run:
      `pnpm --filter @interdomestik/web test:e2e -- --grep \"Group access privacy\"`

- [ ] **Step 3: Write minimal implementation**
      Add only the route helper and any copy/testability adjustment needed for the gate; do not widen the product surface beyond the aggregate-only dashboard.

- [ ] **Step 4: Run test to verify it passes**
      Re-run the targeted E2E gate and confirm PASS.

- [ ] **Step 5: Commit**
      Commit after the office-tier privacy proof is green.

## Chunk 3: Advance Planning Artifacts And Verify

### Task 3: Mark `GA04` complete and verify the full slice

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
      Mark `GA04` complete, note that the `P4G` queue is currently exhausted after this slice, and record the proof references.

- [ ] **Step 4: Run test to verify it passes**
      Run:
      `pnpm plan:status`
      `pnpm plan:audit`
      `pnpm security:guard`
      `pnpm e2e:gate`
      `pnpm pr:verify`

- [ ] **Step 5: Commit**
      Commit the completed `GA04` slice after all verification passes.
