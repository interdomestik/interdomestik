import { deniesClaimMessageContent } from '@/lib/branch-manager-message-boundary';
import { getBranchManagerNotificationCopy } from '@/lib/notifications/branch-manager-copy';
import { getLocale, getTranslations } from 'next-intl/server';
import { getMemberClaimDetail } from '@/features/claims/tracking/server/getMemberClaimDetail';
import {
  notificationClaimId,
  notificationDisplayCopy,
  storedClaimLabel,
} from '@/lib/notifications/display-copy';
import { getNotificationsCore as getNotificationsCoreDomain } from '@interdomestik/domain-communications/notifications/get';
import { reportServerError } from '@interdomestik/domain-communications/server-error';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import type { Session } from './context';

class NotificationClaimLookupError extends Error {
  readonly code = 'CLAIM_LOOKUP_FAILED';

  constructor() {
    super('Notification claim lookup failed');
    this.name = 'NotificationClaimLookupError';
  }
}

export async function getNotificationsCore(params: {
  session: Session | null;
  authority: TenantAuthority | null;
  limit?: number;
}) {
  if (params.limit && (params.limit < 1 || params.limit > 100)) {
    throw new Error('Invalid limit');
  }
  const rows = await getNotificationsCoreDomain(params);
  const locale = await getLocale();
  const t = deniesClaimMessageContent(params.session?.user?.role)
    ? null
    : await getTranslations({ locale, namespace: 'notifications' });
  const labels = new Map<string, Promise<string | null>>();
  const displayRows = [];
  for (const row of rows) {
    if (
      !t ||
      row.previewRestricted ||
      (row.type === 'new_message' && row.previewRestricted !== false)
    ) {
      displayRows.push(
        getBranchManagerNotificationCopy(row.type, locale).then(copy => ({ ...row, ...copy }))
      );
      continue;
    }
    const claimId = notificationClaimId(row);
    // Legacy raw-ID entries reuse the member's existing claim reader and admission.
    if (
      claimId &&
      !storedClaimLabel(row) &&
      params.session?.user.role === 'member' &&
      !labels.has(claimId)
    ) {
      labels.set(
        claimId,
        getMemberClaimDetail(claimId)
          .then(claim => claim?.title ?? null)
          .catch(error => {
            reportServerError('Notification claim lookup failed', error);
            throw new NotificationClaimLookupError();
          })
      );
    }
    const label = claimId ? labels.get(claimId) : undefined;
    displayRows.push(
      Promise.resolve(label ?? null).then(title => ({
        ...row,
        ...notificationDisplayCopy(row, t, title),
      }))
    );
  }
  return Promise.all(displayRows);
}
