export type ExistingGrantRow = {
  accessTenantId: string;
  actorId: string;
  caseId: string;
  correlationId: string;
  expiresAt: Date | null;
  id: string;
  revokedAt: Date | null;
  tenantId: string;
};

export type GrantConflictInput = {
  actorId: string;
  caseId: string;
  correlationId: string;
  expiresAt: Date | null;
  grantId: string;
  homeTenantId: string;
  now: Date;
  recoveryLegalTenantId: string;
};

function sameExpiry(left: Date | null, right: Date | null): boolean {
  return (left?.getTime() ?? null) === (right?.getTime() ?? null);
}

export function classifyExistingHandoffGrant(
  existing: ExistingGrantRow | undefined,
  args: GrantConflictInput
):
  | 'active_grant_conflict'
  | 'already_exists'
  | 'correlation_conflict'
  | 'expiry_conflict'
  | 'expired_exists'
  | 'revoked_exists' {
  const isSameGrant =
    existing?.id === args.grantId &&
    existing.tenantId === args.homeTenantId &&
    existing.accessTenantId === args.recoveryLegalTenantId &&
    existing.caseId === args.caseId &&
    existing.actorId === args.actorId &&
    existing.correlationId === args.correlationId;
  if (isSameGrant) {
    if (existing.revokedAt) return 'revoked_exists';
    if (existing.expiresAt && existing.expiresAt <= args.now) return 'expired_exists';
    if (!sameExpiry(existing.expiresAt, args.expiresAt)) return 'expiry_conflict';
    return 'already_exists';
  }
  if (
    existing?.tenantId === args.homeTenantId &&
    existing.accessTenantId === args.recoveryLegalTenantId &&
    existing.caseId === args.caseId &&
    existing.actorId === args.actorId &&
    !existing.revokedAt
  ) {
    return 'active_grant_conflict';
  }
  return 'correlation_conflict';
}
