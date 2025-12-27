import { markMessagesAsReadCore as markMessagesAsReadCoreDomain } from '@interdomestik/domain-communications/messages/mark-read';
import type { Session } from './context';

export async function markMessagesAsReadCore(params: {
  session: NonNullable<Session> | null;
  messageIds: string[];
}) {
  return markMessagesAsReadCoreDomain(params);
}
