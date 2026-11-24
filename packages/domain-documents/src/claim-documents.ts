import { type TenantTransaction } from '@interdomestik/database';
import { claimDocuments } from '@interdomestik/database/schema';
import { withAccessTenant, withTenant } from '@interdomestik/database/tenant-security';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { and, asc, count, eq, gt, isNull, or } from 'drizzle-orm';

export const OPS_CLAIM_DOCUMENT_PAGE_SIZE = 25;

type VisibleClaimDocumentScope = Readonly<{
  documentScope: () => { claimId: string; authority: TenantAuthority };
}>;

export async function listVisibleClaimDocuments(
  tx: TenantTransaction,
  {
    visibleClaim,
    afterId,
    limit,
  }: {
    visibleClaim: VisibleClaimDocumentScope;
    afterId?: string;
    limit: typeof OPS_CLAIM_DOCUMENT_PAGE_SIZE;
  }
) {
  const { claimId, authority } = visibleClaim.documentScope();
  const { accessTenantId, principal } = readTenantAuthority(authority);
  const scope = and(
    or(
      withAccessTenant({ accessTenantId }, claimDocuments),
      withTenant(accessTenantId, claimDocuments.tenantId, isNull(claimDocuments.accessTenantId))
    ),
    eq(claimDocuments.claimId, claimId)
  );

  if (principal?.role === 'branch_manager') {
    const [summary] = await tx.select({ count: count() }).from(claimDocuments).where(scope);
    return { kind: 'summary', count: summary.count } as const;
  }

  if (limit !== OPS_CLAIM_DOCUMENT_PAGE_SIZE) throw new Error('Invalid claim document page size');
  const rows = await tx
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
    .where(and(scope, afterId === undefined ? undefined : gt(claimDocuments.id, afterId)))
    .orderBy(asc(claimDocuments.id))
    .limit(limit + 1);

  const items = rows.slice(0, limit);
  return {
    kind: 'page',
    items,
    nextCursor: rows.length > limit ? items.at(-1)!.id : null,
  } as const;
}
