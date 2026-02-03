# Member Dashboard Phase 1 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement a claims‑first Member dashboard backed by a server‑only domain read model, with stable E2E markers and minimal UI composition.

**Architecture:** Add a new domain package (`@interdomestik/domain-member`) that exposes `getMemberDashboardData`. The Member page (`/{locale}/member`) will call this server‑only function and render simple, deterministic blocks with test IDs. E2E validates the golden path using existing seed data.

**Tech Stack:** Next.js App Router (server components), TypeScript, Drizzle ORM, Vitest, Playwright.

---

### Task 1: Scaffold the domain-member package

**Files:**

- Create: `packages/domain-member/package.json`
- Create: `packages/domain-member/tsconfig.json`
- Create: `packages/domain-member/vitest.config.ts`
- Create: `packages/domain-member/src/index.ts`

**Step 1: Create package.json**

```json
{
  "name": "@interdomestik/domain-member",
  "version": "0.1.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./get-member-dashboard-data": "./src/get-member-dashboard-data.ts"
  },
  "scripts": {
    "type-check": "tsc --noEmit",
    "test:unit": "vitest run",
    "test": "vitest run"
  },
  "dependencies": {
    "@interdomestik/database": "workspace:*",
    "drizzle-orm": "^0.45.1"
  },
  "devDependencies": {
    "@vitest/coverage-v8": "^4.0.16",
    "postcss": "^8.5.6",
    "vitest": "^4.0.16"
  }
}
```

**Step 2: Create tsconfig.json**

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 3: Create vitest.config.ts**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
  },
});
```

**Step 4: Create src/index.ts**

```ts
export * from './get-member-dashboard-data';
```

**Step 5: Commit**

```bash
git add packages/domain-member/package.json \
  packages/domain-member/tsconfig.json \
  packages/domain-member/vitest.config.ts \
  packages/domain-member/src/index.ts
git commit -m "chore(domain-member): scaffold package"
```

---

### Task 2: RED — Write failing unit test for member dashboard data

**Files:**

- Create: `packages/domain-member/src/get-member-dashboard-data.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from 'vitest';
import { getMemberDashboardData } from './get-member-dashboard-data';

const mockDb = {
  query: {
    user: { findFirst: vi.fn() },
    claims: { findMany: vi.fn() },
  },
};

vi.mock('@interdomestik/database', () => ({ db: mockDb }));
vi.mock('@interdomestik/database/schema', () => ({
  claims: { tenantId: 'claim.tenant_id', userId: 'claim.userId', updatedAt: 'updatedAt' },
  user: { tenantId: 'user.tenant_id', id: 'user.id' },
}));
vi.mock('@interdomestik/database/tenant-security', () => ({
  withTenant: vi.fn((_tenantId: string, _col: string, condition: unknown) => condition),
}));

function dateISO(value: string) {
  return new Date(value);
}

describe('getMemberDashboardData', () => {
  it('selects most recently updated open claim as activeClaimId', async () => {
    mockDb.query.user.findFirst.mockResolvedValue({
      id: 'member-1',
      name: 'Member One',
      memberNumber: 'M-0001',
    });

    mockDb.query.claims.findMany.mockResolvedValue([
      {
        id: 'c-1',
        claimNumber: 'CLM-001',
        status: 'resolved',
        createdAt: dateISO('2026-01-01'),
        updatedAt: dateISO('2026-01-05'),
      },
      {
        id: 'c-2',
        claimNumber: 'CLM-002',
        status: 'submitted',
        createdAt: dateISO('2026-01-02'),
        updatedAt: dateISO('2026-02-01'),
      },
      {
        id: 'c-3',
        claimNumber: 'CLM-003',
        status: 'verification',
        createdAt: dateISO('2026-01-03'),
        updatedAt: dateISO('2026-01-20'),
      },
    ]);

    const data = await getMemberDashboardData({
      memberId: 'member-1',
      tenantId: 'tenant-1',
      locale: 'sq',
    });

    expect(data.member.name).toBe('Member One');
    expect(data.activeClaimId).toBe('c-2');
    expect(data.claims[0].claimNumber).toBe('CLM-002');
    expect(data.claims[0].stageKey).toBe('submitted');
    expect(data.claims[0].stageLabel).toBe('Submitted');
    expect(data.claims[0].requiresMemberAction).toBe(false);
    expect(data.claims[0].nextMemberAction).toBeUndefined();
    expect(data.supportHref).toBe('/sq/member/help');
  });

  it('returns empty-state friendly data when there are no claims', async () => {
    mockDb.query.user.findFirst.mockResolvedValue({
      id: 'member-2',
      name: 'Member Two',
      memberNumber: null,
    });

    mockDb.query.claims.findMany.mockResolvedValue([]);

    const data = await getMemberDashboardData({
      memberId: 'member-2',
      tenantId: 'tenant-1',
      locale: 'sq',
    });

    expect(data.claims).toHaveLength(0);
    expect(data.activeClaimId).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @interdomestik/domain-member test:unit --run src/get-member-dashboard-data.test.ts`  
Expected: FAIL (module not found / function not implemented)

---

### Task 3: GREEN — Implement getMemberDashboardData

**Files:**

- Create: `packages/domain-member/src/get-member-dashboard-data.ts`

**Step 1: Write minimal implementation**

```ts
import { db } from '@interdomestik/database';
import { claims, user } from '@interdomestik/database/schema';
import { withTenant } from '@interdomestik/database/tenant-security';
import { desc, eq } from 'drizzle-orm';

const OPEN_STATUSES = new Set([
  'draft',
  'submitted',
  'verification',
  'evaluation',
  'negotiation',
  'court',
]);

type ClaimStatus =
  | 'draft'
  | 'submitted'
  | 'verification'
  | 'evaluation'
  | 'negotiation'
  | 'court'
  | 'resolved'
  | 'rejected';

export type MemberDashboardData = {
  member: {
    id: string;
    name: string;
    membershipNumber: string | null;
  };
  claims: Array<{
    id: string;
    claimNumber: string | null;
    status: ClaimStatus;
    stageKey: string;
    stageLabel: string;
    submittedAt: string | null;
    updatedAt: string | null;
    requiresMemberAction: boolean;
    nextMemberAction?: {
      label: string;
      actionType: 'upload_document' | 'review_offer' | 'provide_info';
      href: string;
    };
  }>;
  activeClaimId: string | null;
  supportHref: string;
};

function formatStageLabel(status: string) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function normalizeDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function getMemberDashboardData(params: {
  memberId: string;
  tenantId: string;
  locale: string;
}): Promise<MemberDashboardData> {
  const { memberId, tenantId, locale } = params;

  const member = await db.query.user.findFirst({
    where: withTenant(tenantId, user.tenantId, eq(user.id, memberId)),
    columns: { id: true, name: true, memberNumber: true },
  });

  if (!member) {
    throw new Error('Member not found');
  }

  const rawClaims = await db.query.claims.findMany({
    where: withTenant(tenantId, claims.tenantId, eq(claims.userId, memberId)),
    orderBy: [desc(claims.updatedAt)],
    columns: {
      id: true,
      claimNumber: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const claimsData = rawClaims.map(claim => {
    const status = (claim.status || 'draft') as ClaimStatus;
    return {
      id: claim.id,
      claimNumber: claim.claimNumber,
      status,
      stageKey: status,
      stageLabel: formatStageLabel(status),
      submittedAt: normalizeDate(claim.createdAt),
      updatedAt: normalizeDate(claim.updatedAt ?? claim.createdAt),
      requiresMemberAction: false,
    };
  });

  const activeClaim = claimsData.find(c => OPEN_STATUSES.has(c.status));

  return {
    member: {
      id: member.id,
      name: member.name,
      membershipNumber: member.memberNumber ?? null,
    },
    claims: claimsData,
    activeClaimId: activeClaim?.id ?? null,
    supportHref: `/${locale}/member/help`,
  };
}
```

**Step 2: Run test to verify it passes**

Run: `pnpm --filter @interdomestik/domain-member test:unit --run src/get-member-dashboard-data.test.ts`  
Expected: PASS

**Step 3: Commit**

```bash
git add packages/domain-member/src/get-member-dashboard-data.ts \
  packages/domain-member/src/get-member-dashboard-data.test.ts
git commit -m "feat(domain-member): add member dashboard read model"
```

---

### Task 4: Wire Member page to new domain function

**Files:**

- Modify: `apps/web/src/app/[locale]/(app)/member/page.tsx`
- Modify: `apps/web/src/components/dashboard/member-dashboard-view.tsx` (replace with Phase‑1 blocks)
- Create: `apps/web/src/components/member-dashboard/*` (small, server‑friendly components)

**Step 1: Write failing test (E2E)**

Add a new Playwright test (see Task 5) that asserts the new test IDs and CTA href. Run it to confirm failure before UI changes.

**Step 2: Implement UI blocks**

- `MemberHeader` with `data-testid="member-header"`
- `PrimaryActions` with `data-testid="member-primary-actions"` and CTA `data-testid="member-start-claim-cta"`
- `ActiveClaimFocus` with `data-testid="member-active-claim"` (conditional)
- `ClaimsOverviewList` with `data-testid="member-claims-list"` (or `member-empty-state`)
- `SupportLink` with `data-testid="member-support-link"`

**Step 3: Wire data**

In `page.tsx`:

- Load session (existing logic)
- Call `getMemberDashboardData({ memberId, tenantId, locale })`
- Pass data to view components

**Step 4: Run smoke check**

Run:

- `bash scripts/m4-gatekeeper.sh`
- `cd apps/web && pnpm playwright test production.spec.ts --project=ks-sq`

**Step 5: Commit**

```bash
git add apps/web/src/app/[locale]/(app)/member/page.tsx \
  apps/web/src/components/dashboard/member-dashboard-view.tsx \
  apps/web/src/components/member-dashboard
git commit -m "feat(member): add claims-first dashboard"
```

---

### Task 5: Add E2E golden path

**Files:**

- Modify: `apps/web/e2e/production.spec.ts` (add member dashboard assertions)

**Step 1: Write test (RED)**

Add test:

- navigate to member home
- assert `dashboard-page-ready`
- assert test IDs
- assert CTA href uses locale

**Step 2: Run test to verify it fails**

Run: `cd apps/web && pnpm playwright test production.spec.ts --project=ks-sq`

**Step 3: Keep test stable**

Use `member-start-claim-cta` testid and locale‑aware href assertion.

**Step 4: Commit**

```bash
git add apps/web/e2e/production.spec.ts
git commit -m "test(e2e): cover member dashboard golden path"
```

---

## Execution Handoff

Plan complete and saved to `docs/plans/2026-02-03-member-dashboard-phase1.md`.

Two execution options:

1. Subagent-Driven (this session) — dispatch fresh subagent per task, review between tasks, fast iteration
2. Parallel Session (separate) — open new session with executing-plans, batch execution with checkpoints

Which approach?
