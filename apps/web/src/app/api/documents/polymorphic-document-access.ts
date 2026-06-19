import type * as DatabaseModule from '@interdomestik/database';
import { policies } from '@interdomestik/database/schema';
import { and, eq } from 'drizzle-orm';

import { isFullTenantClaimsRole } from './access-policy';
import { canReadPolymorphicClaimDocument } from './claim-document-access';

type DatabaseClient = typeof DatabaseModule.db;

export type PolymorphicDocumentRow = {
  id: string;
  entityId: string;
  entityType: string;
  category?: string | null;
  uploadedBy: string | null;
};

export async function canReadPolymorphicDocument(args: {
  db: DatabaseClient;
  polyDoc: PolymorphicDocumentRow;
  session: { user: { id: string; branchId?: string | null } };
  tenantId: string;
  userRole: string | undefined;
}): Promise<boolean> {
  const { db, polyDoc, session, tenantId, userRole } = args;

  if (isFullTenantClaimsRole(userRole)) return true;
  if (
    polyDoc.uploadedBy === session.user.id &&
    !(userRole === 'agent' && polyDoc.entityType === 'claim') &&
    polyDoc.entityType !== 'policy'
  ) {
    return true;
  }
  if (polyDoc.entityType === 'member' || polyDoc.entityType === 'user') {
    return polyDoc.entityId === session.user.id;
  }
  if (polyDoc.entityType === 'claim') return canReadPolymorphicClaimDocument(args);
  if (polyDoc.entityType !== 'policy') return false;

  const [policyRow] = await db
    .select({ policyOwnerId: policies.userId })
    .from(policies)
    .where(and(eq(policies.id, polyDoc.entityId), eq(policies.tenantId, tenantId)));
  return policyRow?.policyOwnerId === session.user.id;
}
