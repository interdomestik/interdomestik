import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  claimFindFirst: vi.fn(),
  timelineRows: vi.fn(),
  recoveryDecisionRows: vi.fn(),
  select: vi.fn(),
  ensureClaimsAccess: vi.fn(),
  buildClaimVisibilityWhere: vi.fn(),
  getMatterAllowanceVisibility: vi.fn(),
  buildRecoveryDecisionSnapshot: vi.fn((record: Record<string, unknown> | null | undefined) => {
    if (!record?.decisionType) {
      return {
        status: 'pending',
        decidedAt: null,
        explanation: null,
        declineReasonCode: null,
        staffLabel: 'Pending staff decision',
        memberLabel: null,
        memberDescription: null,
      };
    }

    if (record.decisionType === 'accepted') {
      return {
        status: 'accepted',
        decidedAt: record.decidedAt ?? null,
        explanation: record.explanation ?? null,
        declineReasonCode: null,
        staffLabel: 'Accepted for staff-led recovery',
        memberLabel: 'Accepted for staff-led recovery',
        memberDescription: 'We accepted this matter for staff-led recovery.',
      };
    }

    return {
      status: 'declined',
      decidedAt: record.decidedAt ?? null,
      explanation: record.explanation ?? null,
      declineReasonCode: record.declineReasonCode ?? null,
      staffLabel: 'Guidance-only or referral-only under current scope',
      memberLabel: 'Guidance-only or referral-only matter',
      memberDescription:
        'This matter stays guidance-only or referral-only under the current launch scope.',
    };
  }),
  toMemberSafeRecoveryDecision: vi.fn((snapshot: Record<string, unknown> | null | undefined) => {
    if (!snapshot || snapshot.status === 'pending') {
      return null;
    }

    return {
      status: snapshot.status,
      title: snapshot.memberLabel,
      description: snapshot.memberDescription ?? null,
    };
  }),
  captureException: vi.fn(),
  setTag: vi.fn(),
  withServerActionInstrumentation: vi.fn(
    async (_name: string, _options: unknown, callback: () => Promise<unknown>) => callback()
  ),
}));

vi.mock('@/server/domains/claims/guards', () => ({
  ensureClaimsAccess: hoisted.ensureClaimsAccess,
}));

vi.mock('@interdomestik/domain-claims', () => ({
  getMatterAllowanceVisibilityForUser: hoisted.getMatterAllowanceVisibility,
  buildRecoveryDecisionSnapshot: hoisted.buildRecoveryDecisionSnapshot,
  toMemberSafeRecoveryDecision: hoisted.toMemberSafeRecoveryDecision,
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
  claimEscalationAgreements: {
    claimId: 'claimEscalationAgreements.claimId',
    tenantId: 'claimEscalationAgreements.tenantId',
    acceptedAt: 'claimEscalationAgreements.acceptedAt',
    decisionReason: 'claimEscalationAgreements.decisionReason',
    decisionType: 'claimEscalationAgreements.decisionType',
    declineReasonCode: 'claimEscalationAgreements.declineReasonCode',
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

function configureSelectMocks() {
  hoisted.select
    .mockReturnValueOnce({
      from: () => ({
        where: () => ({
          orderBy: () => hoisted.timelineRows(),
        }),
      }),
    })
    .mockReturnValueOnce({
      from: () => ({
        where: () => ({
          limit: () => hoisted.recoveryDecisionRows(),
        }),
      }),
    });
}

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
    hoisted.getMatterAllowanceVisibility.mockResolvedValue(null);
    configureSelectMocks();
    hoisted.recoveryDecisionRows.mockResolvedValue([]);
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

  it('maps annual matter allowance visibility onto the member claim detail dto', async () => {
    hoisted.claimFindFirst.mockResolvedValueOnce({
      id: 'claim_2',
      title: 'Vehicle recovery',
      status: 'negotiation',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-03-01T00:00:00.000Z'),
      description: 'Negotiation started',
      claimAmount: '550.00',
      currency: 'EUR',
      documents: [],
    });
    hoisted.timelineRows.mockResolvedValueOnce([]);
    hoisted.getMatterAllowanceVisibility.mockResolvedValueOnce({
      allowanceTotal: 2,
      consumedCount: 1,
      remainingCount: 1,
      windowStart: new Date('2026-01-01T00:00:00.000Z'),
      windowEnd: new Date('2026-12-31T23:59:59.000Z'),
    });

    const result = await getMemberClaimDetail(
      {
        user: {
          id: 'member-1',
          role: 'member',
          tenantId: 'tenant-1',
        },
      },
      'claim_2'
    );

    expect(hoisted.getMatterAllowanceVisibility).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      userId: 'member-1',
    });
    expect((result as { matterAllowance?: unknown } | null)?.matterAllowance).toEqual({
      allowanceTotal: 2,
      consumedCount: 1,
      remainingCount: 1,
      windowStart: new Date('2026-01-01T00:00:00.000Z'),
      windowEnd: new Date('2026-12-31T23:59:59.000Z'),
    });
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
    const recoveryDecisionChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    };
    hoisted.select.mockReset();
    hoisted.select.mockReturnValueOnce(selectChain).mockReturnValueOnce(recoveryDecisionChain);

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

  it('maps an accepted recovery decision into a member-safe claim detail summary', async () => {
    hoisted.claimFindFirst.mockResolvedValueOnce({
      id: 'claim_accepted',
      title: 'Vehicle recovery',
      status: 'evaluation',
      createdAt: new Date('2026-03-10T00:00:00.000Z'),
      updatedAt: new Date('2026-03-14T00:00:00.000Z'),
      description: 'Waiting for recovery work to start',
      claimAmount: '550.00',
      currency: 'EUR',
      documents: [],
    });
    hoisted.timelineRows.mockResolvedValueOnce([]);
    hoisted.recoveryDecisionRows.mockResolvedValueOnce([
      {
        acceptedAt: new Date('2026-03-14T09:00:00.000Z'),
        decisionReason: 'Clear insurer path and viable monetary recovery.',
        decisionType: 'accepted',
        declineReasonCode: null,
      },
    ]);

    const result = await getMemberClaimDetail(
      {
        user: {
          id: 'member-1',
          role: 'member',
          tenantId: 'tenant-1',
        },
      },
      'claim_accepted'
    );

    expect((result as { recoveryDecision?: unknown } | null)?.recoveryDecision).toEqual({
      status: 'accepted',
      title: 'Accepted for staff-led recovery',
      description: 'We accepted this matter for staff-led recovery.',
    });
  });
});
