# Commission Tracking And Referral Rewards Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build deterministic agent commission tracking plus configurable member referral rewards, with ownership transfer and company-owned fallback, using the existing Interdomestik billing and assignment model.

**Architecture:** Keep `subscriptions.agentId` as the billing-time ownership source of truth, synchronize `user.agentId` and `agent_clients` during reassignment, extend the existing commission domain for renewal attribution, and add a separate `member_referral_rewards` ledger plus configurable referral settings while keeping the existing `referrals` table as the referral-relationship source record.

**Tech Stack:** Next.js App Router, TypeScript, Drizzle ORM, PostgreSQL, Zod, Vitest, Playwright, pnpm monorepo.

---

## File Structure

### Existing files to modify

- `packages/domain-users/src/admin/update-user-agent.ts`
- `packages/domain-membership-billing/src/commissions/types.ts`
- `packages/domain-membership-billing/src/commissions/create.ts`
- `packages/domain-membership-billing/src/paddle-webhooks/handlers/utils/extras.ts`
- `packages/domain-membership-billing/src/paddle-webhooks/handlers/test.ts` or closest webhook test files
- `packages/domain-referrals/src/member-referrals/types.ts`
- `packages/domain-referrals/src/member-referrals/stats.ts`
- `apps/web/src/actions/admin-users/update-user-agent.core.ts`
- `apps/web/src/app/[locale]/admin/commissions/_core.entry.tsx`
- `apps/web/src/app/[locale]/(agent)/agent/commissions/_core.entry.tsx`
- `apps/web/src/components/member/referral-card.tsx`
- `packages/database/src/schema/services.ts`
- `packages/database/src/schema/agents.ts` only if commission metadata or new settings table need schema support

### New files likely required

- `packages/domain-membership-billing/src/commissions/ownership.ts`
- `packages/domain-membership-billing/src/commissions/ownership.test.ts`
- `packages/domain-membership-billing/src/commissions/create-renewal.ts`
- `packages/domain-membership-billing/src/commissions/create-renewal.test.ts`
- `packages/domain-referrals/src/member-referrals/rewards.ts`
- `packages/domain-referrals/src/member-referrals/rewards.test.ts`
- `packages/domain-referrals/src/member-referrals/settings.ts`
- `packages/domain-referrals/src/member-referrals/settings.test.ts`
- `packages/domain-referrals/package.json`
- `packages/domain-membership-billing/package.json`
- `apps/web/src/actions/member-referrals/settings.core.ts`
- `apps/web/src/actions/member-referrals/admin.core.ts`
- `packages/database/drizzle/<new_migration>.sql`

### Responsibility split

- Ownership and renewal commission logic lives in `domain-membership-billing`.
- Referral reward earning, balance, and settings logic lives in `domain-referrals`.
- Reassignment orchestration stays in `domain-users` plus web action wrappers.
- Admin/member/agent UI remains in `apps/web`.

## Chunk 1: Ownership And Renewal Attribution

### Task 1: Make reassignment update billing ownership too

**Files:**

- Modify: `packages/domain-users/src/admin/update-user-agent.ts`
- Modify: `apps/web/src/actions/admin-users/update-user-agent.core.ts`
- Test: add or update `packages/domain-users/src/admin/update-user-agent.test.ts`

- [ ] **Step 1: Write the failing test**

Add tests proving reassignment:

- updates `user.agentId`
- updates active `subscriptions.agentId`
- deactivates old `agent_clients`
- creates or reactivates one active `agent_clients` row for the new agent
- leaves no active `agent_clients` row when moved to company-owned

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @interdomestik/domain-users test:unit --run src/admin/update-user-agent.test.ts`
Expected: FAIL because `subscriptions.agentId` is not updated today.

- [ ] **Step 3: Write minimal implementation**

Extend the existing transaction in `update-user-agent.ts` to update active subscriptions for the member in the same tenant and keep all three ownership surfaces aligned.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @interdomestik/domain-users test:unit --run src/admin/update-user-agent.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/domain-users/src/admin/update-user-agent.ts packages/domain-users/src/admin/update-user-agent.test.ts apps/web/src/actions/admin-users/update-user-agent.core.ts
git commit -m "feat: sync subscription ownership on reassignment"
```

### Task 2: Add canonical ownership resolution for renewal billing

**Files:**

- Create: `packages/domain-membership-billing/src/commissions/ownership.ts`
- Test: `packages/domain-membership-billing/src/commissions/ownership.test.ts`
- Modify: `packages/domain-membership-billing/src/index.ts`

- [ ] **Step 1: Write the failing test**

Add tests proving:

- `subscriptions.agentId` is the canonical billing owner
- `null` means company-owned
- drift against `user.agentId` / `agent_clients` is logged in metadata or returned diagnostics, but does not change resolved owner

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @interdomestik/domain-membership-billing test:unit --run src/commissions/ownership.test.ts`
Expected: FAIL because resolver does not exist.

- [ ] **Step 3: Write minimal implementation**

Implement a resolver that returns:

- `ownerType`
- `agentId`
- drift diagnostics for metadata/audit logging

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @interdomestik/domain-membership-billing test:unit --run src/commissions/ownership.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/domain-membership-billing/src/commissions/ownership.ts packages/domain-membership-billing/src/commissions/ownership.test.ts packages/domain-membership-billing/src/index.ts
git commit -m "feat: add canonical commission ownership resolver"
```

### Task 3: Create renewal commissions from canonical ownership

**Files:**

- Create: `packages/domain-membership-billing/src/commissions/create-renewal.ts`
- Test: `packages/domain-membership-billing/src/commissions/create-renewal.test.ts`
- Modify: `packages/domain-membership-billing/src/commissions/create.ts`
- Modify: `packages/domain-membership-billing/src/paddle-webhooks/handlers/utils/extras.ts`
- Modify: related webhook tests under `packages/domain-membership-billing/src/paddle-webhooks/handlers/utils/extras.test.ts`

- [ ] **Step 1: Write the failing test**

Add tests proving:

- renewal commission is created for current assigned agent
- company-owned renewal creates no commission
- metadata captures canonical ownership source and drift info
- idempotency still holds on `(tenantId, subscriptionId, type)`

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @interdomestik/domain-membership-billing test:unit --run src/commissions/create-renewal.test.ts`
Expected: FAIL because renewal path is not implemented.

- [ ] **Step 3: Write minimal implementation**

Add a renewal-specific creation helper and wire webhook extras so:

- new sale path stays `new_membership`
- renewal path uses ownership resolver and `renewal`
- metadata records `saleOwnerType`, `saleOwnerId`, `originalSellerAgentId`, and `ownershipResolvedFrom`

- [ ] **Step 4: Run test to verify it passes**

Run:

- `pnpm --filter @interdomestik/domain-membership-billing test:unit --run src/commissions/create-renewal.test.ts`
- `pnpm --filter @interdomestik/domain-membership-billing test:unit --run src/paddle-webhooks/handlers/utils/extras.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/domain-membership-billing/src/commissions/create-renewal.ts packages/domain-membership-billing/src/commissions/create-renewal.test.ts packages/domain-membership-billing/src/commissions/create.ts packages/domain-membership-billing/src/paddle-webhooks/handlers/utils/extras.ts packages/domain-membership-billing/src/paddle-webhooks/handlers/utils/extras.test.ts
git commit -m "feat: add renewal commission attribution"
```

## Chunk 2: Referral Reward Domain And Settings

### Task 4: Evolve referral schema for configurable reward tracking

**Files:**

- Modify: `packages/database/src/schema/services.ts`
- Create: `packages/database/drizzle/<new_migration>.sql`
- Optional create: settings table schema in `packages/database/src/schema/services.ts` or a nearby schema file if that matches repo conventions
- Test: relevant schema tests if present

- [ ] **Step 1: Write the failing test**

Add or update tests that prove:

- one reward exists per qualifying subscription event
- referral reward status supports `pending`, `approved`, `credited`, `paid`, `void`
- configurable reward fields can represent fixed and percent rewards
- tenant-scoped settings exist for program configuration

- [ ] **Step 2: Run test to verify it fails**

Run the narrowest existing database/domain tests that cover referral schema consumers.
Expected: FAIL because current schema lacks the new fields and idempotency guarantees.

- [ ] **Step 3: Write minimal implementation**

Keep the existing `referrals` table as the referral relationship/source record, but add a separate reward ledger and settings store that match the approved spec. Add:

- `member_referral_rewards` table for reward earning, approval, crediting, payout, and idempotent settlement
- tenant-scoped uniqueness rule for initial reward idempotency on the reward ledger
- tenant-scoped referral settings table or equivalent persisted settings surface
- only the minimum linkage fields needed on `referrals` itself if relationship capture needs to reference the reward path

- [ ] **Step 4: Run test to verify it passes**

Run the updated schema/domain tests and `pnpm db:generate` if needed.
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/database/src/schema/services.ts packages/database/drizzle
git commit -m "feat: extend referral schema for reward tracking"
```

### Task 5: Implement reward earning, balances, and settings domain logic

**Files:**

- Create: `packages/domain-referrals/src/member-referrals/rewards.ts`
- Create: `packages/domain-referrals/src/member-referrals/rewards.test.ts`
- Create: `packages/domain-referrals/src/member-referrals/settings.ts`
- Create: `packages/domain-referrals/src/member-referrals/settings.test.ts`
- Modify: `packages/domain-referrals/src/member-referrals/stats.ts`
- Modify: `packages/domain-referrals/src/member-referrals/types.ts`
- Modify: `packages/domain-referrals/src/index.ts`
- Modify: `packages/domain-referrals/package.json`
- Modify: `packages/domain-membership-billing/package.json`

- [ ] **Step 1: Write the failing test**

Add tests proving:

- direct online signup does not earn reward
- member-referred first paid membership creates exactly one reward
- renewal does not create reward
- reward settings are configurable and default-safe
- member stats expose pending, credited, and payout-eligible balances

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @interdomestik/domain-referrals test:unit --run src/member-referrals/rewards.test.ts`
Expected: FAIL because earning logic does not exist.

- [ ] **Step 3: Write minimal implementation**

Implement reward creation and stats on top of the new `member_referral_rewards` ledger, using `referrals` only as the relationship/input source. Add the required package exports so web actions can import new domain modules through stable package paths.

- [ ] **Step 4: Run test to verify it passes**

Run:

- `pnpm --filter @interdomestik/domain-referrals test:unit --run src/member-referrals/rewards.test.ts`
- `pnpm --filter @interdomestik/domain-referrals test:unit --run src/member-referrals/link.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/domain-referrals/src/member-referrals packages/domain-referrals/package.json packages/domain-membership-billing/package.json
git commit -m "feat: add configurable referral reward domain"
```

### Task 6: Integrate member referral rewards into billing event flow

**Files:**

- Modify: `packages/domain-membership-billing/src/paddle-webhooks/handlers/utils/extras.ts`
- Modify: `packages/domain-membership-billing/src/paddle-webhooks/handlers/subscriptions.ts`
- Modify: referral and webhook tests

- [ ] **Step 1: Write the failing test**

Add tests proving:

- member-referred first sale creates reward using configured settings
- reward does not stack with agent commission unless explicitly enabled
- renewal path never creates member reward

- [ ] **Step 2: Run test to verify it fails**

Run the narrowest webhook/referral integration tests.
Expected: FAIL because reward integration is missing.

- [ ] **Step 3: Write minimal implementation**

Wire billing hooks to call the referral-reward domain for qualifying first-sale events only.

- [ ] **Step 4: Run test to verify it passes**

Run the updated webhook and referral domain tests.
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/domain-membership-billing/src/paddle-webhooks packages/domain-referrals/src/member-referrals
git commit -m "feat: earn referral rewards from paid memberships"
```

## Chunk 3: Admin, Agent, And Member Surfaces

### Task 7: Expose referral settings and reward review through server actions

**Files:**

- Create: `apps/web/src/actions/member-referrals/settings.core.ts`
- Create: `apps/web/src/actions/member-referrals/admin.core.ts`
- Modify: `apps/web/src/actions/member-referrals.core.ts`
- Add tests under `apps/web/src/actions/member-referrals*.test.ts`

- [ ] **Step 1: Write the failing test**

Add tests proving:

- admin can read and update referral settings
- admin can review and transition reward states
- members can only read their own referral stats and links

- [ ] **Step 2: Run test to verify it fails**

Run the new/updated action tests.
Expected: FAIL because actions do not exist.

- [ ] **Step 3: Write minimal implementation**

Add action wrappers around the new domain functions with existing auth/context patterns.

- [ ] **Step 4: Run test to verify it passes**

Run the action tests.
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/actions/member-referrals*
git commit -m "feat: add referral settings and admin reward actions"
```

### Task 8: Update admin, agent, and member UIs

**Files:**

- Modify: `apps/web/src/app/[locale]/admin/commissions/_core.entry.tsx`
- Modify: `apps/web/src/app/[locale]/(agent)/agent/commissions/_core.entry.tsx`
- Modify: `apps/web/src/components/member/referral-card.tsx`
- Modify: `apps/web/src/components/agent/commissions-list.tsx`
- Modify or create: dedicated admin referral settings/review component(s)
- Modify: `apps/web/src/components/admin/users-table.tsx`
- Modify: `apps/web/src/components/admin/users-sections.tsx`
- Add or update component tests where they already exist

- [ ] **Step 1: Write the failing test**

Add tests proving:

- admin sees commission type distinctions and ownership metadata
- member referral UI reflects reward balance semantics, not “activate agent profile”
- agent commission view remains agent-only and does not leak member reward data

- [ ] **Step 2: Run test to verify it fails**

Run narrow component/page tests.
Expected: FAIL because current UI copy and data model are outdated.

- [ ] **Step 3: Write minimal implementation**

Update UI to match the approved design:

- admin commission page surfaces `new_membership` vs `renewal`
- admin referral settings/review UI exists and can operate on the reward ledger
- admin users surface can move a member to company-owned or assign a replacement agent
- member referral card shows configurable reward messaging and balance progress
- agent page remains commission-only

- [ ] **Step 4: Run test to verify it passes**

Run the updated component/page tests.
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/[locale]/admin/commissions/_core.entry.tsx apps/web/src/app/[locale]/(agent)/agent/commissions/_core.entry.tsx apps/web/src/components/member/referral-card.tsx apps/web/src/components/agent/commissions-list.tsx
git commit -m "feat: align commission and referral reward surfaces"
```

### Task 9: Final verification and integration review

**Files:**

- Review all files touched in prior tasks

- [ ] **Step 1: Run targeted tests**

Run:

- `pnpm --filter @interdomestik/domain-users test:unit --run src/admin/update-user-agent.test.ts`
- `pnpm --filter @interdomestik/domain-membership-billing test:unit`
- `pnpm --filter @interdomestik/domain-referrals test:unit`
- `pnpm --filter @interdomestik/web test:unit --run src/actions/member-referrals.wrapper.test.ts`

Expected: PASS

- [ ] **Step 2: Run repo verification**

Run:

- `pnpm exec prettier --check docs/superpowers/specs/2026-03-19-commission-tracking-design.md docs/superpowers/plans/2026-03-21-commission-tracking-and-referral-rewards.md`
- `git diff --check`
- `pnpm test:release-gate`

Expected: PASS

- [ ] **Step 3: Run higher gates if the implementation reaches cross-app readiness**

Run:

- `pnpm e2e:gate`
- `pnpm security:guard`
- `pnpm pr:verify`

Expected: PASS or explicit documented blockers.

- [ ] **Step 4: Commit final integration fixes**

```bash
git add .
git commit -m "feat: implement commission tracking and referral rewards"
```

## Review Notes For Controller

- Execute with fresh subagent per task.
- Do spec-compliance review before code-quality review on every task.
- Do not start UI work before ownership and billing attribution are stable.
- Keep route authority unchanged; no edits to `apps/web/src/proxy.ts`.
- Treat `subscriptions.agentId` as canonical billing owner throughout.
