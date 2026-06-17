export type CaseScopedDocumentClass =
  | 'correspondence'
  | 'contract'
  | 'evidence'
  | 'export'
  | 'identity'
  | 'legal'
  | 'medical'
  | 'other'
  | 'receipt';

export type CaseScopedAccessGrant = {
  accessTenantId: string;
  actorId: string;
  caseId: string;
  documentClasses: readonly CaseScopedDocumentClass[];
  expiresAt?: Date | string | null;
  revokedAt?: Date | string | null;
};

function isActiveGrant(grant: CaseScopedAccessGrant, now: Date): boolean {
  if (grant.revokedAt) return false;
  if (!grant.expiresAt) return true;
  return new Date(grant.expiresAt).getTime() > now.getTime();
}

export function canUseCaseScopedDocumentGrant(args: {
  accessTenantId: string;
  actorId: string;
  caseId: string;
  documentClass: CaseScopedDocumentClass;
  grants?: readonly CaseScopedAccessGrant[] | null;
  now?: Date;
}): boolean {
  const accessTenantId = args.accessTenantId.trim();
  const actorId = args.actorId.trim();
  const caseId = args.caseId.trim();

  if (!accessTenantId || !actorId || !caseId) {
    return false;
  }

  const now = args.now ?? new Date();

  return (args.grants ?? []).some(
    grant =>
      grant.accessTenantId.trim() === accessTenantId &&
      grant.actorId.trim() === actorId &&
      grant.caseId.trim() === caseId &&
      grant.documentClasses.includes(args.documentClass) &&
      isActiveGrant(grant, now)
  );
}
