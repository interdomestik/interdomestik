# D07 Sentry Burn-Rate Alerts Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a repo-owned, inspectable Sentry alert-management surface for the three committed D07 SLO alerts, plus the minimum runtime telemetry needed to make the webhook SLO queryable.

**Architecture:** Keep routing, auth, and tenancy untouched. Add checked-in alert definitions plus a small Node-based check/apply script that targets Sentry's alert API using environment-provided org, project, and action identifiers. Add a narrow webhook telemetry bridge so the webhook SLO can be described in Sentry using a stable query surface instead of relying only on database-side `processing_result`.

**Tech Stack:** Node.js scripts, Sentry REST API, `node:test`, Next.js route handlers, `@sentry/nextjs`

---

### Task 1: Plan And Script Surface

**Files:**

- Create: `docs/plans/2026-03-09-d07-sentry-burn-rate-alerts-implementation-plan.md`
- Create: `scripts/sentry-alerts-lib.mjs`
- Create: `scripts/sentry-alerts.mjs`
- Test: `scripts/sentry-alerts.test.mjs`

**Step 1: Write the failing tests**

Cover:

- the checked-in D07 alert catalog contains exactly the three committed alert surfaces
- every alert definition is tied to the canonical SLO docs
- the sync logic can diff local definitions against remote Sentry rules
- the sync payload preserves stable names, queries, thresholds, and actions

**Step 2: Run test to verify it fails**

Run: `node --test scripts/sentry-alerts.test.mjs`

Expected: FAIL because the alert-definition library and sync script do not exist yet.

**Step 3: Write minimal implementation**

Implement:

- a checked-in `D07` alert catalog
- helpers for validation, normalization, and diffing
- a CLI with `check` and `apply` modes

**Step 4: Run test to verify it passes**

Run: `node --test scripts/sentry-alerts.test.mjs`

Expected: PASS

### Task 2: Webhook Telemetry Bridge

**Files:**

- Modify: `packages/domain-membership-billing/src/paddle-webhooks/persist.ts`
- Test: `packages/domain-membership-billing/src/paddle-webhooks/persist.test.ts`

**Step 1: Write the failing test**

Cover:

- successful webhook processing emits the stable Sentry signal needed by the D07 alert query
- failed webhook processing emits the matching failure signal
- duplicate and invalid-signature paths do not masquerade as success

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @interdomestik/domain-membership-billing test:unit --run persist.test.ts`

Expected: FAIL because no explicit D07 telemetry bridge exists yet.

**Step 3: Write minimal implementation**

Add the narrowest possible Sentry message/tag bridge in the webhook persistence path, without touching routing or billing logic.

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @interdomestik/domain-membership-billing test:unit --run persist.test.ts`

Expected: PASS

### Task 3: Package And Verification Wiring

**Files:**

- Modify: `package.json`
- Test: `scripts/package-e2e-scripts.test.mjs`

**Step 1: Write the failing test**

Cover:

- root package exposes `sentry:alerts:check` and `sentry:alerts:apply`

**Step 2: Run test to verify it fails**

Run: `node --test scripts/package-e2e-scripts.test.mjs`

Expected: FAIL because the scripts are not present yet.

**Step 3: Write minimal implementation**

Add package scripts for the D07 alert-management surface.

**Step 4: Run test to verify it passes**

Run: `node --test scripts/package-e2e-scripts.test.mjs`

Expected: PASS

### Task 4: Evidence And Operating Surface

**Files:**

- Create: `docs/plans/2026-03-09-d07-sentry-burn-rate-alerts-evidence.md`
- Modify: `docs/plans/current-tracker.md`

**Step 1: Write the evidence doc**

Capture:

- the three D07 alerts
- the repo-owned script surface
- required environment for apply/check
- how the simulated verification is run and recorded

**Step 2: Update tracker proof references**

Add the D07 evidence references once implementation and verification are complete.

### Task 5: Verification

**Files:**

- Test: `scripts/sentry-alerts.test.mjs`
- Test: `packages/domain-membership-billing/src/paddle-webhooks/persist.test.ts`
- Test: `scripts/package-e2e-scripts.test.mjs`

**Step 1: Run targeted verification**

Run:

- `node --test scripts/sentry-alerts.test.mjs`
- `pnpm --filter @interdomestik/domain-membership-billing test:unit --run persist.test.ts`
- `node --test scripts/package-e2e-scripts.test.mjs`

**Step 2: Run broader required checks if the environment is available**

Run:

- `pnpm pr:verify`
- `pnpm security:guard`

Expected:

- targeted tests pass locally
- broader checks either pass or are reported with concrete blockers
