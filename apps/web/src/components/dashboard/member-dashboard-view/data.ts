import { and, claimDocuments, claims, eq } from '@interdomestik/database';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { count } from 'drizzle-orm';
import { requireAdmittedMember } from '@/lib/privacy/require-member-acceptance';
import { getActiveSubscription } from '@interdomestik/domain-membership-billing/subscription';
import { UnauthorizedError } from '@interdomestik/shared-auth';
import { cache } from 'react';

const documentCountMemo: (
  memberId: string,
  authority: TenantAuthority
) => { pending?: Promise<number> } = cache(() => ({}));

export async function getDashboardSupplementalData() {
  const admission = await requireAdmittedMember();
  if (!admission.ok) throw new UnauthorizedError();
  const { session, authority } = admission.authorized;
  const memberId = session.user.id;

  const subscriptionTask = getActiveSubscription(memberId, authority);
  const memo = documentCountMemo(memberId, authority);
  const documentsTask = (memo.pending ??= loadCount());

  const [subscriptionResult, documentsCountResult] = await Promise.allSettled([
    subscriptionTask,
    documentsTask,
  ]);

  if (subscriptionResult.status === 'rejected') {
    console.error(
      '[MemberDashboardView] Active subscription lookup failed:',
      subscriptionResult.reason
    );
  }

  if (documentsCountResult.status === 'rejected') {
    console.error(
      '[MemberDashboardView] Document summary lookup failed:',
      documentsCountResult.reason
    );
  }

  return [
    subscriptionResult.status === 'fulfilled' ? subscriptionResult.value : null,
    documentsCountResult.status === 'fulfilled' ? documentsCountResult.value : 0,
    subscriptionResult.status === 'fulfilled',
  ] as const;

  async function loadCount() {
    const { tenantId } = readTenantAuthority(authority);
    const rows = await withTenantAuthority(authority, tx =>
      // db-access-guard: tenant-scoped -- reason: document summary joins only viewer-owned claims inside tenant context
      tx
        .select({ count: count() })
        .from(claimDocuments)
        .leftJoin(claims, eq(claimDocuments.claimId, claims.id))
        .where(
          and(
            eq(claims.userId, memberId),
            eq(claims.tenantId, tenantId),
            eq(claimDocuments.tenantId, tenantId)
          )
        )
    );
    return Number(rows[0]?.count ?? 0);
  }
}
