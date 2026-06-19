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
  const inserted = await args.tx
    .insert(caseScopedAccessGrants)
    .values({
      id: args.grantId,
      tenantId: args.homeTenantId,
      accessTenantId: args.recoveryLegalTenantId,
      caseId: args.caseId,
      actorId: args.actorId,
      documentClasses: [...HANDOFF_DOCUMENT_CLASSES],
      expiresAt: args.expiresAt,
      revokedAt: null,
      createdById: args.createdById,
      correlationId: args.correlationId,
      createdAt: args.createdAt,
    })
    .onConflictDoNothing()
    .returning({ id: caseScopedAccessGrants.id });
  if (inserted.length === 1) return 'inserted';

  const existing = await loadExistingHandoffGrantForConflict(args.tx, args);
  return classifyExistingHandoffGrant(existing, { ...args, now: args.createdAt });
}
