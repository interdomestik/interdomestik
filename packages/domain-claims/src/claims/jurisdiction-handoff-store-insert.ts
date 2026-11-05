import { caseScopedAccessGrants } from '@interdomestik/database';

import { loadExistingHandoffGrantForConflict } from './jurisdiction-handoff-grant-conflict-query';
import { HANDOFF_DOCUMENT_CLASSES } from './jurisdiction-handoff-document-classes';
import { classifyExistingHandoffGrant } from './jurisdiction-handoff-store-conflicts';
import type { HandoffTx } from './jurisdiction-handoff-types';

export async function insertHandoffGrant(args: {
  actorId: string;
  caseId: string;
  correlationId: string;
  createdAt: Date;
  createdById: string;
  expiresAt: Date | null;
  grantId: string;
  homeTenantId: string;
  recoveryLegalTenantId: string;
  tx: HandoffTx;
}): Promise<
  | 'active_grant_conflict'
  | 'already_exists'
  | 'correlation_conflict'
  | 'expiry_conflict'
  | 'expired_exists'
  | 'inserted'
  | 'revoked_exists'
> {
  // The transaction is split off so the grant fields can be passed on without carrying it.
  const { tx, ...grant } = args;
  const inserted = await tx
    .insert(caseScopedAccessGrants)
    .values({
      id: grant.grantId,
      tenantId: grant.homeTenantId,
      accessTenantId: grant.recoveryLegalTenantId,
      caseId: grant.caseId,
      actorId: grant.actorId,
      documentClasses: [...HANDOFF_DOCUMENT_CLASSES],
      expiresAt: grant.expiresAt,
      revokedAt: null,
      createdById: grant.createdById,
      correlationId: grant.correlationId,
      createdAt: grant.createdAt,
    })
    .onConflictDoNothing()
    .returning({ id: caseScopedAccessGrants.id });
  if (inserted.length === 1) return 'inserted';

  const existing = await loadExistingHandoffGrantForConflict(tx, grant);
  return classifyExistingHandoffGrant(existing, { ...grant, now: grant.createdAt });
}
