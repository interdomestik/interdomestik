export const trackingSchemaMock = {
  claims: {
    id: 'claims.id',
    tenantId: 'claims.tenantId',
    status: 'claims.status',
    updatedAt: 'claims.updatedAt',
  },
  claimTrackingTokens: {
    claimId: 'claimTrackingTokens.claimId',
    tenantId: 'claimTrackingTokens.tenantId',
    tokenHash: 'claimTrackingTokens.tokenHash',
    expiresAt: 'claimTrackingTokens.expiresAt',
    revokedAt: 'claimTrackingTokens.revokedAt',
  },
};

export function createTrackingDrizzleMock() {
  return {
    and: (...args: unknown[]) => ({ op: 'and', args }),
    eq: (left: unknown, right: unknown) => ({ op: 'eq', left, right }),
    gt: (left: unknown, right: unknown) => ({ op: 'gt', left, right }),
    isNull: (value: unknown) => ({ op: 'isNull', value }),
    or: (...args: unknown[]) => ({ op: 'or', args }),
  };
}
