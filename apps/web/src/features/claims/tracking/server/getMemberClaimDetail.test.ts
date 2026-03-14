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
    tenantId: 'claimStageHistory.tenantId',
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

  it('maps the derived SLA phase onto the member claim detail dto', async () => {
    hoisted.claimFindFirst.mockResolvedValueOnce({
      id: 'claim_1',
      title: 'Missing baggage',
      status: 'verification',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      updatedAt: new Date('2025-01-03T00:00:00.000Z'),
      description: 'Need boarding pass',
      claimAmount: 120,
      currency: 'EUR',
      documents: [
        {
          id: 'doc_1',
          name: 'boarding-pass.pdf',
          category: 'evidence',
          createdAt: new Date('2025-01-02T00:00:00.000Z'),
          fileType: 'application/pdf',
          fileSize: 2048,
        },
      ],
    });
    hoisted.timelineRows.mockResolvedValueOnce([
      {
        id: 'history_1',
        createdAt: new Date('2025-01-04T00:00:00.000Z'),
        fromStatus: 'submitted',
        toStatus: 'verification',
        note: 'Please upload your boarding pass.',
        isPublic: true,
      },
    ]);

    const result = await getMemberClaimDetail({ user: { id: 'member_1' } }, 'claim_1');

    expect(result).toEqual(
      expect.objectContaining({
        id: 'claim_1',
        status: 'verification',
        slaPhase: 'incomplete',
      })
    );
  });

  it('scopes timeline reads to tenant-owned public history only', async () => {
    hoisted.ensureClaimsAccess.mockReturnValue({
      tenantId: 'tenant_mk',
      userId: 'member_1',
      role: 'member',
      branchId: null,
    });
    hoisted.buildClaimVisibilityWhere.mockReturnValue({ visible: true });

    hoisted.claimFindFirst.mockResolvedValueOnce({
      id: 'claim_1',
      title: 'Missing baggage',
      status: 'verification',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      updatedAt: new Date('2025-01-03T00:00:00.000Z'),
      description: 'Need boarding pass',
      claimAmount: 120,
      currency: 'EUR',
      documents: [],
    });

    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockResolvedValue([]),
    };
    hoisted.select.mockReturnValueOnce(selectChain);

    await getMemberClaimDetail({ user: { id: 'member_1' } }, 'claim_1');

    expect(selectChain.where).toHaveBeenCalledWith({
      op: 'and',
      args: [
        { op: 'eq', left: 'claimStageHistory.claimId', right: 'claim_1' },
        { op: 'eq', left: 'claimStageHistory.tenantId', right: 'tenant_mk' },
        { op: 'eq', left: 'claimStageHistory.isPublic', right: true },
      ],
    });
  });
});
