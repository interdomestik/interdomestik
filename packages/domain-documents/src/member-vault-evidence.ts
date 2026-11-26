import type { TenantTransaction } from '@interdomestik/database';
import { claimDocuments, claims } from '@interdomestik/database/schema';
import { and, desc, eq } from 'drizzle-orm';

export async function readCurrentMemberVaultEvidence(
  database: TenantTransaction,
  tenantId: string,
  claimId: string,
  viewerId: string
) {
  // db-access-guard: tenant-scoped -- reason: exact MK tenant and current case ownership are checked in the evidence statement
  return database
    .select({
      id: claimDocuments.id,
      category: claimDocuments.category,
      createdAt: claimDocuments.createdAt,
    })
    .from(claimDocuments)
    .innerJoin(
      claims,
      and(
        eq(claims.tenantId, claimDocuments.tenantId),
        eq(claims.id, claimDocuments.claimId),
        eq(claims.userId, viewerId)
      )
    )
    .where(
      and(
        eq(claimDocuments.tenantId, tenantId),
        eq(claimDocuments.claimId, claimId),
        eq(claimDocuments.category, 'evidence')
      )
    )
    .orderBy(desc(claimDocuments.createdAt), desc(claimDocuments.id));
}
