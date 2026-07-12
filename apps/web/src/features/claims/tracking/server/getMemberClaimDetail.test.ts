import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  caseCompanionNextStep: {
    owner: 'interdomestik',
    statusSentenceKey: 'claims-tracking.case_companion.status_sentence.evaluation',
    actionKind: 'no_action',
    actionKey: 'claims-tracking.case_companion.action.no_action',
    nextStepDate: null,
    awaitingDateReason: 'case_team_review',
    renderMode: 'standard',
  },
  claimFindFirst: vi.fn(),
  timelineRows: vi.fn(),
  recoveryDecisionRows: vi.fn(),
  select: vi.fn(),
  getMemberTimelineFromDomainEvents: vi.fn(),
  getMemberVaultConsentDisplay: vi.fn(),
  ensureClaimsAccess: vi.fn(),
  buildClaimVisibilityWhere: vi.fn(),
  getMatterAllowanceVisibility: vi.fn(),
  deriveCaseCompanionNextStep: vi.fn(),
  resolveClaimLifecycleReadProjection: vi.fn((claim: { status?: string | null }) => ({
    status: claim.status ?? 'draft',
  })),
  buildRecoveryDecisionSnapshot: vi.fn(),
  toMemberSafeRecoveryDecision: vi.fn(),
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
  deriveCaseCompanionNextStep: hoisted.deriveCaseCompanionNextStep,
  resolveClaimLifecycleReadProjection: hoisted.resolveClaimLifecycleReadProjection,
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
  ERASURE_REDACTED_VALUE: '[erased]',
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
  setTag: hoisted.setTag,
  withServerActionInstrumentation: hoisted.withServerActionInstrumentation,
}));

vi.mock('./member-domain-event-timeline', () => ({
  getMemberTimelineFromDomainEvents: hoisted.getMemberTimelineFromDomainEvents,
}));

vi.mock('./getMemberVaultConsentDisplay', () => ({
  getMemberVaultConsentDisplay: hoisted.getMemberVaultConsentDisplay,
}));

import { getMemberClaimDetail } from './getMemberClaimDetail';
import {
  buildRecoveryDecisionSnapshotMock,
  toMemberSafeRecoveryDecisionMock,
} from './getMemberClaimDetail-recovery.test-support';
import { normalizeMemberTimelineMockRows } from './member-domain-event-timeline.test-support';

const memberSession = {
  user: {
    id: 'member-1',
    role: 'member',
    tenantId: 'tenant-1',
  },
} as const;

function configureSelectMocks() {
  hoisted.select.mockReturnValueOnce({
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
    hoisted.getMemberVaultConsentDisplay.mockResolvedValue({ kind: 'hidden' });
    hoisted.buildRecoveryDecisionSnapshot.mockImplementation(buildRecoveryDecisionSnapshotMock);
    hoisted.toMemberSafeRecoveryDecision.mockImplementation(toMemberSafeRecoveryDecisionMock);
    hoisted.deriveCaseCompanionNextStep.mockReturnValue(hoisted.caseCompanionNextStep);
    hoisted.getMemberTimelineFromDomainEvents.mockImplementation(async context => {
      return normalizeMemberTimelineMockRows(context, await hoisted.timelineRows());
    });
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

    const result = await getMemberClaimDetail(memberSession, 'claim-1');

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
        memberTrustSummary: {
          state: 'member_action_required',
          titleKey: 'claims-tracking.tracking.assurance.title',
          bodyKey: 'claims-tracking.tracking.assurance.body.member_action_required',
          stateLabelKey: 'claims-tracking.tracking.assurance.state.member_action_required',
          supportHref: '/member/help?claimId=claim_1&source=member_claim_detail',
        },
      })
    );
  });

  it('derives progress and Case Companion timing from the latest public timeline event', async () => {
    const claimUpdatedAt = new Date('2026-04-16T12:30:00.000Z');
    const latestPublicUpdate = new Date('2026-04-15T12:30:00.000Z');

    hoisted.claimFindFirst.mockResolvedValueOnce({
      id: 'claim_progress',
      title: 'Delayed flight',
      status: 'evaluation',
      createdAt: new Date('2026-04-14T09:00:00.000Z'),
      updatedAt: claimUpdatedAt,
      description: 'Compensation review',
      claimAmount: 250,
      currency: 'EUR',
      documents: [],
    });
    hoisted.timelineRows.mockResolvedValueOnce([
      {
        id: 'history_latest',
        createdAt: latestPublicUpdate,
        fromStatus: 'verification',
        toStatus: 'evaluation',
        note: 'We reviewed the boarding pass and moved the case to evaluation.',
        isPublic: true,
      },
      {
        id: 'history_previous',
        createdAt: new Date('2026-04-14T09:00:00.000Z'),
        fromStatus: null,
        toStatus: 'submitted',
        note: 'Claim received.',
        isPublic: true,
      },
    ]);

    const result = await getMemberClaimDetail(memberSession, 'claim_progress');

    expect(result?.progressSummary).toEqual({
      currentStatusLabelKey: 'claims-tracking.status.evaluation',
      latestUpdateAt: latestPublicUpdate,
      latestUpdateLabelKey: 'claims-tracking.status.evaluation',
      latestUpdateNote: 'We reviewed the boarding pass and moved the case to evaluation.',
      nextStepKey: 'claims-tracking.status.next_step.evaluation',
    });
    expect(hoisted.deriveCaseCompanionNextStep).toHaveBeenCalledWith({
      status: 'evaluation',
      latestUpdateAt: latestPublicUpdate,
      piiStatus: 'available',
    });
    expect(hoisted.deriveCaseCompanionNextStep).not.toHaveBeenCalledWith(
      expect.objectContaining({ latestUpdateAt: claimUpdatedAt })
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

    const result = await getMemberClaimDetail(memberSession, 'claim_2');

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

  it('scopes timeline reads to the already-authorized claim context', async () => {
    const createdAt = new Date('2025-01-01T00:00:00.000Z');
    const updatedAt = new Date('2025-01-03T00:00:00.000Z');
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
      createdAt,
      updatedAt,
      description: 'Need boarding pass',
      claimAmount: 120,
      currency: 'EUR',
      documents: [],
    });
    hoisted.timelineRows.mockResolvedValueOnce([
      {
        id: 'event-1',
        date: updatedAt,
        statusFrom: 'submitted',
        statusTo: 'verification',
        labelKey: 'claims-tracking.status.verification',
        note: null,
        isPublic: true,
      },
    ]);

    await getMemberClaimDetail({ user: { id: 'member_1' } }, 'claim_1');

    expect(hoisted.getMemberTimelineFromDomainEvents).toHaveBeenCalledWith({
      claimId: 'claim_1',
      tenantId: 'tenant_mk',
      currentStatus: 'verification',
      createdAt,
      piiStatus: 'available',
      updatedAt,
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

    const result = await getMemberClaimDetail(memberSession, 'claim_accepted');

    expect((result as { recoveryDecision?: unknown } | null)?.recoveryDecision).toEqual({
      status: 'accepted',
      title: 'Accepted for staff-led recovery',
      description: 'We accepted this matter for staff-led recovery.',
    });
  });

  it('adds the safe Vault display after resolving the member-owned claim', async () => {
    hoisted.claimFindFirst.mockResolvedValueOnce({
      id: 'claim-vault',
      userId: 'member-1',
      category: 'vehicle',
      title: 'Vehicle evidence',
      status: 'evaluation',
      createdAt: new Date('2026-07-01Z'),
      updatedAt: null,
      description: null,
      claimAmount: null,
      currency: 'EUR',
      documents: [],
    });
    hoisted.timelineRows.mockResolvedValueOnce([]);
    hoisted.getMemberVaultConsentDisplay.mockResolvedValueOnce({ kind: 'ready', items: [] });
    const result = await getMemberClaimDetail(memberSession, 'claim-vault');
    expect(hoisted.getMemberVaultConsentDisplay).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      memberId: 'member-1',
      claimId: 'claim-vault',
      claimCategory: 'vehicle',
      piiStatus: 'available',
    });
    expect(result?.vaultConsentDisplay).toEqual({ kind: 'ready', items: [] });
    const [, sentryOptions] = hoisted.withServerActionInstrumentation.mock.calls[0]!;
    expect(sentryOptions).toEqual({ recordResponse: false });
  });
});
