import { vi } from 'vitest';

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
  context: vi.fn(),
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
    (_name: string, _options: unknown, callback: () => Promise<unknown>) => callback()
  ),
}));

export function getMemberDetailMocks() {
  return hoisted;
}

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
  withTenantContext: vi.fn((_context: unknown, callback: (tx: unknown) => unknown) => {
    hoisted.context(_context);
    return callback({
      query: {
        claims: {
          findFirst: hoisted.claimFindFirst,
        },
      },
      select: hoisted.select,
    });
  }),
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
  domainEvents: {
    createdAt: 'domainEvents.createdAt',
    entityId: 'domainEvents.entityId',
    entityType: 'domainEvents.entityType',
    eventName: 'domainEvents.eventName',
    eventVersion: 'domainEvents.eventVersion',
    id: 'domainEvents.id',
    payload: 'domainEvents.payload',
    tenantId: 'domainEvents.tenantId',
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
