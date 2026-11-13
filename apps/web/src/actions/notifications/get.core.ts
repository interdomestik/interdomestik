import { deniesClaimMessageContent } from '@/lib/branch-manager-message-boundary';
import { getBranchManagerNotificationCopy } from '@/lib/notifications/branch-manager-copy';
import type { AppLocale } from '@/i18n/locales';
import { getTranslations } from 'next-intl/server';
import { getMemberClaimDetail } from '@/features/claims/tracking/server/getMemberClaimDetail';
import {
  notificationClaimId,
  notificationDisplayCopy,
  storedClaimLabel,
} from '@/lib/notifications/display-copy';
import { getNotificationsCore as getNotificationsCoreDomain } from '@interdomestik/domain-communications/notifications/get';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import type { Session } from './context';

export async function getNotificationsCore(params: {
  session: Session | null;
  authority: TenantAuthority | null;
  limit?: number;
  /** Resolved by the caller: an implicit `getLocale()` in a server action is always the default. */
  locale: AppLocale;
}) {
  if (params.limit && (params.limit < 1 || params.limit > 100)) {
    throw new Error('Invalid limit');
  }
  const rows = await getNotificationsCoreDomain(params);
  const { locale } = params;
  if (!deniesClaimMessageContent(params.session?.user?.role)) {
    const t = await getTranslations({ locale, namespace: 'notifications' });
    const labels = new Map<string, Promise<string | null>>();
    return Promise.all(
      rows.map(async row => {
        const claimId = notificationClaimId(row);
        // Legacy raw-ID entries reuse the member's existing claim reader and admission.
        // Unavailable references get neutral copy; stored human titles need no lookup.
        if (
          claimId &&
          !storedClaimLabel(row) &&
          params.session?.user.role === 'member' &&
          !labels.has(claimId)
        ) {
          labels.set(
            claimId,
            getMemberClaimDetail(params.session, params.authority, claimId)
              .then(claim => claim?.title ?? null)
              .catch(() => null)
          );
        }
        const label = claimId ? await labels.get(claimId) : null;
        return { ...row, ...notificationDisplayCopy(row, t, label) };
      })
    );
  }
  return Promise.all(
    rows.map(async row => ({
      ...row,
      ...(await getBranchManagerNotificationCopy(row.type, locale)),
    }))
  );
}
