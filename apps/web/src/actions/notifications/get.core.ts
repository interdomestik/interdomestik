import { getNotificationsCore as getNotificationsCoreDomain } from '@interdomestik/domain-communications/notifications/get';
import type { Session } from './context';

export async function getNotificationsCore(params: { session: Session | null; limit?: number }) {
  if (params.limit && (params.limit < 1 || params.limit > 100)) {
    throw new Error('Invalid limit');
  }
  return getNotificationsCoreDomain(params);
}
