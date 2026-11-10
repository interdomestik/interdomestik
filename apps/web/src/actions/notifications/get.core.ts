import { deniesClaimMessageContent } from '@/lib/branch-manager-message-boundary';
import { getBranchManagerNotificationCopy } from '@/lib/notifications/branch-manager-copy';
import { getLocale } from 'next-intl/server';
import { getNotificationsCore as getNotificationsCoreDomain } from '@interdomestik/domain-communications/notifications/get';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import type { Session } from './context';

export async function getNotificationsCore(params: {
  session: Session | null;
  authority: TenantAuthority | null;
  limit?: number;
}) {
  if (params.limit && (params.limit < 1 || params.limit > 100)) {
    throw new Error('Invalid limit');
  }
  const rows = await getNotificationsCoreDomain(params);
  if (!deniesClaimMessageContent(params.session?.user?.role)) return rows;
  const locale = await getLocale();
  return Promise.all(
    rows.map(async row => ({
      ...row,
      ...(await getBranchManagerNotificationCopy(row.type, locale)),
    }))
  );
}
