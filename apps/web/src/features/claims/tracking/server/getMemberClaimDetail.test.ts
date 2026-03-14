import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  claimFindFirst: vi.fn(),
  timelineRows: vi.fn(),
  select: vi.fn(),
  ensureClaimsAccess: vi.fn(),
  buildClaimVisibilityWhere: vi.fn(),
  captureException: vi.fn(),
  setTag: vi.fn(),
  withServerActionInstrumentation: vi.fn(
    async (_name: string, _options: unknown, callback: () => Promise<unknown>) => callback()
  ),
}));

vi.mock('@/server/domains/claims/guards', () => ({
  ensureClaimsAccess: hoisted.ensureClaimsAccess,
}));

vi.mock('../utils', () => ({
  buildClaimVisibilityWhere: hoisted.buildClaimVisibilityWhere,
}));

vi.mock('@interdomestik/database', () => ({
  db: {
    query: {
      claims: {
        findFirst: hoisted.claimFindFirst,
      },
    },
    select: hoisted.select,
  },
}));

vi.mock('@interdomestik/database/schema', () => ({
  claimDocuments: {
    createdAt: 'claimDocuments.createdAt',
  },
  claims: {
    id: 'claims.id',
  },
  claimStageHistory: {
    claimId: 'claimStageHistory.claimId',
    isPublic: 'claimStageHistory.isPublic',
    createdAt: 'claimStageHistory.createdAt',
  },
}));

vi.mock('@interdomestik/database/constants', () => ({
  CLAIM_STATUSES: ['draft', 'submitted', 'evaluation', 'resolved', 'rejected'],
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
  desc: vi.fn((column: unknown) => ({ column, order: 'desc' })),
  eq: vi.fn((left: unknown, right: unknown) => ({ op: 'eq', left, right })),
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: hoisted.captureException,
  setTag: hoisted.setTag,
  withServerActionInstrumentation: hoisted.withServerActionInstrumentation,
}));

import { getMemberClaimDetail } from './getMemberClaimDetail';

describe('getMemberClaimDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.ensureClaimsAccess.mockReturnValue({
      tenantId: 'tenant-1',
      userId: 'member-1',
      role: 'member',
      branchId: null,
    });
    hoisted.buildClaimVisibilityWhere.mockReturnValue({ visibility: 'member' });
    hoisted.select.mockReturnValue({
      from: () => ({
        where: () => ({
          orderBy: () => hoisted.timelineRows(),
        }),
      }),
    });
  });

  it('returns a fallback public timeline event when no stage history rows exist yet', async () => {
    const createdAt = new Date('2026-03-14T09:00:00.000Z');

    hoisted.claimFindFirst.mockResolvedValueOnce({
      id: 'claim-1',
      title: 'Flight delay claim',
      status: 'submitted',
      createdAt,
      updatedAt: null,
      description: 'Delayed overnight',
      claimAmount: '650.00',
      currency: 'EUR',
      documents: [],
    });
    hoisted.timelineRows.mockResolvedValueOnce([]);

    const result = await getMemberClaimDetail(
      {
        user: {
          id: 'member-1',
          role: 'member',
          tenantId: 'tenant-1',
        },
      },
      'claim-1'
    );

    expect(result).not.toBeNull();
    expect(result?.timeline).toHaveLength(1);
    expect(result?.timeline[0]).toMatchObject({
      statusFrom: null,
      statusTo: 'submitted',
      labelKey: 'claims-tracking.status.submitted',
      note: null,
      isPublic: true,
    });
    expect(result?.timeline[0]?.date).toEqual(createdAt);
  });
});
