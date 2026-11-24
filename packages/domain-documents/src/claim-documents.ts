import { type TenantTransaction } from '@interdomestik/database';
import { claimDocuments } from '@interdomestik/database/schema';
import { withAccessTenant, withTenant } from '@interdomestik/database/tenant-security';
import {
  readVisibleOpsClaimDocumentScope,
  type VisibleOpsClaim,
} from '@interdomestik/domain-claims/admin-claims/visible-ops-claim';
import { and, asc, count, eq, gt, isNull, type SQL } from 'drizzle-orm';

export const OPS_CLAIM_DOCUMENT_PAGE_SIZE = 25;

export async function listVisibleClaimDocuments(
  tx: TenantTransaction,
  {
    visibleClaim,
    afterId,
    limit,
  }: {
    visibleClaim: VisibleOpsClaim;
    afterId?: string;
    limit: typeof OPS_CLAIM_DOCUMENT_PAGE_SIZE;
  }
) {
  const { claimId, accessTenantId, countOnly, claimStillVisible } =
    readVisibleOpsClaimDocumentScope(tx, visibleClaim);
  const claimScope = and(eq(claimDocuments.claimId, claimId), claimStillVisible);
  const explicitAccess = withAccessTenant({ accessTenantId }, claimDocuments, claimScope);
  const homeFallback = withTenant(
    accessTenantId,
    claimDocuments.tenantId,
    and(isNull(claimDocuments.accessTenantId), claimScope)
  );

  if (countOnly) {
    const counts = await tx
      .select({ count: count() })
      .from(claimDocuments)
      .where(explicitAccess)
      .unionAll(tx.select({ count: count() }).from(claimDocuments).where(homeFallback));
    return { kind: 'summary', count: counts.reduce((total, row) => total + row.count, 0) } as const;
  }

  if (limit !== OPS_CLAIM_DOCUMENT_PAGE_SIZE) throw new Error('Invalid claim document page size');
  const cursor = afterId === undefined ? undefined : gt(claimDocuments.id, afterId);
  const page = (scope: SQL) =>
    tx
      .select({
        id: claimDocuments.id,
        tenantId: claimDocuments.tenantId,
        name: claimDocuments.name,
        fileSize: claimDocuments.fileSize,
        fileType: claimDocuments.fileType,
        createdAt: claimDocuments.createdAt,
        filePath: claimDocuments.filePath,
        bucket: claimDocuments.bucket,
      })
      .from(claimDocuments)
      .where(and(scope, cursor))
      .orderBy(asc(claimDocuments.id))
      .limit(limit + 1);

  const rows = await page(explicitAccess)
    .unionAll(page(homeFallback))
    .orderBy(({ id }) => asc(id))
    .limit(limit + 1);

  const items = rows.slice(0, limit);
  return {
    kind: 'page',
    items,
    nextCursor: rows.length > limit ? items.at(-1)!.id : null,
  } as const;
}
