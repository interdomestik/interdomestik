type ExistingGrantRow = {
  accessTenantId: string;
  actorId: string;
  caseId: string;
  correlationId: string;
  id: string;
  revokedAt: Date | null;
  tenantId: string;
};

type GrantConflictInput = {
  actorId: string;
  caseId: string;
  correlationId: string;
  grantId: string;
  homeTenantId: string;
  recoveryLegalTenantId: string;
};

export function classifyExistingHandoffGrant(
  existing: ExistingGrantRow | undefined,
  args: GrantConflictInput
): 'active_grant_conflict' | 'already_exists' | 'correlation_conflict' | 'revoked_exists' {
  const isSameGrant =
    existing?.id === args.grantId &&
    existing.tenantId === args.homeTenantId &&
    existing.accessTenantId === args.recoveryLegalTenantId &&
    existing.caseId === args.caseId &&
    existing.actorId === args.actorId &&
    existing.correlationId === args.correlationId;
  if (isSameGrant) return existing.revokedAt ? 'revoked_exists' : 'already_exists';
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
