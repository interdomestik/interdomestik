import { type TenantTransaction } from '@interdomestik/database';
import { claimDocuments } from '@interdomestik/database/schema';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { withAccessTenant, withTenant } from '@interdomestik/database/tenant-security';
import {
  readOpsClaimAuthority,
  selectVisibleOpsClaim,
} from '@interdomestik/domain-claims/admin-claims/visible-ops-claim';
import { searchAssignableStaff } from '@interdomestik/domain-users/admin/search-assignable-staff';
import { isSuperAdmin, isTenantAdmin, ROLES } from '@interdomestik/shared-auth';
import { and, asc, count, eq, exists, gt, isNull, sql, type SQL } from 'drizzle-orm';

const OPS_CLAIM_DOCUMENT_PAGE_SIZE = 25;

type VisibleClaim = NonNullable<ReturnType<typeof selectVisibleOpsClaim>>;

function selectDocumentPageArm(tx: TenantTransaction, scope: SQL, afterId?: string) {
  const cursor = afterId === undefined ? undefined : gt(claimDocuments.id, afterId);
  return tx
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
    .limit(OPS_CLAIM_DOCUMENT_PAGE_SIZE + 1);
}

async function readClaimDocuments(
  tx: TenantTransaction,
  {
    visibleClaim,
    claimId,
    accessTenantId,
    countOnly,
    afterId,
  }: {
    visibleClaim: VisibleClaim;
    claimId: string;
    accessTenantId: string;
    countOnly: boolean;
    afterId?: string;
  }
) {
  const claimScope = and(
    eq(claimDocuments.claimId, claimId),
    exists(sql`(select 1 from ${visibleClaim})`)
  );
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

  const limit = OPS_CLAIM_DOCUMENT_PAGE_SIZE;
  const rows = await selectDocumentPageArm(tx, explicitAccess, afterId)
    .unionAll(selectDocumentPageArm(tx, homeFallback, afterId))
    .orderBy(({ id }) => asc(id))
    .limit(limit + 1);

  const items = rows.slice(0, limit);
  return {
    kind: 'page',
    items,
    nextCursor: rows.length > limit ? items.at(-1)!.id : null,
  } as const;
}

export async function readOpsClaimDetailData({
  authority,
  claimId,
  documentsAfter,
  staffAfter,
  staffSearch,
}: {
  authority: TenantAuthority;
  claimId: string;
  documentsAfter?: string;
  staffAfter?: string;
  staffSearch?: string;
}) {
  const scope = readOpsClaimAuthority(authority);
  if (!scope) return null;
  const { accessTenantId, principal } = scope;
  const countOnly = principal.role === ROLES.branch_manager;

  return await withTenantAuthority(authority, async tx => {
    const visibleClaim = selectVisibleOpsClaim(tx, { authority, claimId });
    if (!visibleClaim) return null;
    const [claim] = await tx.select().from(visibleClaim);
    if (!claim) return null;

    const documents = await readClaimDocuments(tx, {
      visibleClaim,
      claimId: claim.id,
      accessTenantId,
      countOnly,
      afterId: documentsAfter,
    });
    const staffPage =
      isTenantAdmin(principal.role) || isSuperAdmin(principal.role)
        ? await searchAssignableStaff(tx, { authority, search: staffSearch, afterId: staffAfter })
        : null;
    return { claim, documents, staffPage };
  });
}
