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
  return getNotificationsCoreDomain(params);
}
