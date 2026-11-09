import { and, claimDocuments, claims, eq } from '@interdomestik/database';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { count } from 'drizzle-orm';
import { cache } from 'react';

export const getCachedClaimDocumentCount = cache(
  async (userId: string, authority: TenantAuthority): Promise<number> => {
    const { tenantId } = readTenantAuthority(authority);
    const rows = await withTenantAuthority(authority, tx =>
      // db-access-guard: tenant-scoped -- reason: document summary joins only viewer-owned claims inside tenant context
      tx
        .select({ count: count() })
        .from(claimDocuments)
        .leftJoin(claims, eq(claimDocuments.claimId, claims.id))
        .where(
          and(
            eq(claims.userId, userId),
            eq(claims.tenantId, tenantId),
            eq(claimDocuments.tenantId, tenantId)
          )
        )
    );

    return Number(rows[0]?.count ?? 0);
  }
);
