import { getNotificationsCore as getNotificationsCoreDomain } from '@interdomestik/domain-communications/notifications/get';
import type { Session } from './context';

export async function getNotificationsCore(params: { session: Session | null; limit?: number }) {
  return getNotificationsCoreDomain(params);
}
