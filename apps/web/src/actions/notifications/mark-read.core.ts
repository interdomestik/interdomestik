import {
  markAllAsReadCore as markAllAsReadCoreDomain,
  markAsReadCore as markAsReadCoreDomain,
} from '@interdomestik/domain-communications/notifications/mark-read';
import type { Session } from './context';

export async function markAsReadCore(params: { session: Session | null; notificationId: string }) {
  return markAsReadCoreDomain(params);
}

export async function markAllAsReadCore(params: { session: Session | null }) {
  return markAllAsReadCoreDomain(params);
}
