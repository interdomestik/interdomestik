import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  claim: vi.fn(),
  timeline: vi.fn(),
  decision: vi.fn(),
}));

vi.mock('@/server/domains/claims/guards', () => ({
  ensureClaimsAccess: () => ({
    tenantId: 'tenant-1',
    userId: 'member-1',
    role: 'member',
    branchId: null,
  }),
}));
vi.mock('@/features/claims/policy', () => ({ deriveClaimSlaPhase: () => 'completed' }));
vi.mock('@/features/claims/tracking/memberTrustSummary', () => ({
  buildMemberClaimTrustSummary: () => ({}),
}));
vi.mock('@interdomestik/domain-claims', () => ({
  deriveCaseCompanionNextStep: () => ({}),
  buildRecoveryDecisionSnapshot: () => ({}),
  getMatterAllowanceVisibilityForUser: async () => null,
  getRecoveryDeclineMemberDescription: () => 'We cannot accept this matter for staff-led recovery.',
  resolveClaimLifecycleReadProjection: () => ({ status: 'rejected' }),
  toMemberSafeRecoveryDecision: () => null,
}));
vi.mock('@interdomestik/database', () => ({
  db: {
    query: { claims: { findFirst: mocks.claim } },
    select: () => ({
      from: () => ({
        leftJoin: () => ({
          where: () => ({
            orderBy: () => ({
              limit: () => ({
                then: (resolve: (rows: unknown) => void) => mocks.decision().then(resolve),
              }),
            }),
          }),
        }),
      }),
    }),
  },
  ERASURE_REDACTED_VALUE: '[erased]',
}));
vi.mock('@interdomestik/database/schema', () => ({
  claimDocuments: { createdAt: 'createdAt' },
  claimEscalationAgreements: {
    acceptedAt: 'acceptedAt',
    decisionReason: 'decisionReason',
    decisionType: 'decisionType',
    declineReasonCode: 'declineReasonCode',
    claimId: 'claimId',
    tenantId: 'tenantId',
  },
  claims: { id: 'id' },
  domainEvents: {
    createdAt: 'eventCreatedAt',
    entityId: 'eventEntityId',
    entityType: 'eventEntityType',
    eventName: 'eventName',
    eventVersion: 'eventVersion',
    id: 'eventId',
    payload: 'eventPayload',
    tenantId: 'eventTenantId',
  },
}));
vi.mock('drizzle-orm', () => ({
  and: (...items: unknown[]) => items,
  desc: (value: unknown) => value,
  eq: (left: unknown, right: unknown) => [left, right],
}));
vi.mock('@sentry/nextjs', () => ({
  setTag: () => undefined,
  withServerActionInstrumentation: async (
    _name: string,
    _options: unknown,
    run: () => Promise<unknown>
  ) => run(),
}));
vi.mock('../utils', () => ({ buildClaimVisibilityWhere: () => ({}) }));
vi.mock('./member-domain-event-timeline', () => ({
  getMemberTimelineFromDomainEvents: mocks.timeline,
}));
vi.mock('./getMemberVaultConsentDisplay', () => ({
  getMemberVaultConsentDisplay: async () => ({ kind: 'hidden' }),
}));

import { getMemberClaimDetail } from './getMemberClaimDetail';

describe('member claim detail privacy', () => {
  it('scopes timeline reads to the authorized claim and tenant', async () => {
    const createdAt = new Date('2026-03-10T00:00:00.000Z');
    const updatedAt = new Date('2026-03-14T00:00:00.000Z');
    mocks.claim.mockResolvedValueOnce({
      id: 'claim-scoped',
      userId: 'member-1',
      title: 'Recovery request',
      status: 'rejected',
      createdAt,
      updatedAt,
      description: null,
      claimAmount: null,
      currency: 'EUR',
      documents: [],
    });
    mocks.timeline.mockResolvedValueOnce([
      {
        id: 'status-scoped',
        date: updatedAt,
        statusFrom: 'evaluation',
        statusTo: 'rejected',
        labelKey: 'claims-tracking.status.rejected',
        note: null,
        isPublic: true,
      },
    ]);
    mocks.decision.mockResolvedValueOnce([]);

    await getMemberClaimDetail(
      { user: { id: 'member-1', role: 'member', tenantId: 'tenant-1' } },
      'claim-scoped'
    );

    expect(mocks.timeline).toHaveBeenCalledWith({
      claimId: 'claim-scoped',
      tenantId: 'tenant-1',
      currentStatus: 'rejected',
      createdAt,
      piiStatus: 'available',
      updatedAt,
    });
  });

  it('removes historic sensitive notes from non-rejection updates and the member payload', async () => {
    const privateNote = 'PRIVATE-INTEGRITY-ALLEGATION';
    mocks.claim.mockResolvedValueOnce({
      id: 'claim-sensitive',
      userId: 'member-1',
      title: 'Recovery request',
      status: 'rejected',
      createdAt: new Date('2026-03-10T00:00:00.000Z'),
      updatedAt: new Date('2026-03-14T00:00:00.000Z'),
      description: null,
      claimAmount: null,
      currency: 'EUR',
      documents: [],
    });
    mocks.timeline.mockResolvedValueOnce([
      {
        id: 'later-progress',
        date: new Date('2026-03-15T00:00:00.000Z'),
        statusFrom: 'rejected',
        statusTo: 'evaluation',
        labelKey: 'claims-tracking.status.evaluation',
        note: privateNote,
        isPublic: true,
      },
      {
        id: 'old-rejection',
        date: new Date('2026-03-14T00:00:00.000Z'),
        statusFrom: 'evaluation',
        statusTo: 'rejected',
        labelKey: 'claims-tracking.status.rejected',
        note: privateNote,
        isPublic: true,
      },
    ]);
    mocks.decision.mockResolvedValueOnce([
      {
        acceptedAt: new Date('2026-03-13T00:00:00.000Z'),
        decisionReason: privateNote,
        decisionType: 'declined',
        declineReasonCode: 'conflict_or_integrity_concern',
        decisionEventAt: null,
        decisionEventPayload: null,
      },
    ]);

    const result = await getMemberClaimDetail(
      { user: { id: 'member-1', role: 'member', tenantId: 'tenant-1' } },
      'claim-sensitive'
    );

    expect(result?.timeline[0]?.note).toBeNull();
    expect(result?.timeline[1]?.note).toBe('We cannot accept this matter for staff-led recovery.');
    expect(result?.progressSummary.latestUpdateNote).toBeNull();
    expect(JSON.stringify(result)).not.toContain(privateNote);
  });

  it.each([
    {
      scenario: 'after a decision when an agreement is accepted later',
      status: 'rejected',
      statusFrom: 'rejected',
      decision: {
        acceptedAt: new Date('2026-03-16T00:00:00.000Z'),
        decisionReason: 'More evidence is needed',
        decisionType: 'declined',
        declineReasonCode: 'insufficient_evidence',
        decisionEventAt: new Date('2026-03-13T00:00:00.000Z'),
        decisionEventPayload: {
          decisionType: 'declined',
          declineReasonCode: 'insufficient_evidence',
        },
      },
    },
    {
      scenario: 'when an agreement has no decision',
      status: 'evaluation',
      statusFrom: 'intake',
      decision: {
        acceptedAt: new Date('2026-03-14T00:00:00.000Z'),
        decisionReason: null,
        decisionType: null,
        declineReasonCode: null,
        decisionEventAt: null,
        decisionEventPayload: null,
      },
    },
  ])(
    'keeps ordinary progress in the member payload $scenario',
    async ({ status, statusFrom, decision }) => {
      mocks.claim.mockResolvedValueOnce({
        id: 'claim-ordinary',
        userId: 'member-1',
        title: 'Recovery request',
        status,
        createdAt: new Date('2026-03-10T00:00:00.000Z'),
        updatedAt: new Date('2026-03-16T00:00:00.000Z'),
        description: null,
        claimAmount: null,
        currency: 'EUR',
        documents: [],
      });
      mocks.timeline.mockResolvedValueOnce([
        {
          id: 'ordinary-progress',
          date: new Date('2026-03-15T00:00:00.000Z'),
          statusFrom,
          statusTo: 'evaluation',
          labelKey: 'claims-tracking.status.evaluation',
          note: 'Please upload the receipt.',
          isPublic: true,
        },
      ]);
      mocks.decision.mockResolvedValueOnce([decision]);

      const result = await getMemberClaimDetail(
        { user: { id: 'member-1', role: 'member', tenantId: 'tenant-1' } },
        'claim-ordinary'
      );

      expect(result?.timeline[0]?.note).toBe('Please upload the receipt.');
      expect(result?.progressSummary.latestUpdateNote).toBe('Please upload the receipt.');
      expect(mocks.timeline.mock.invocationCallOrder.at(-1)).toBeLessThan(
        mocks.decision.mock.invocationCallOrder.at(-1)!
      );
    }
  );
});
