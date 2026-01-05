import { markMessagesAsReadCore as markMessagesAsReadCoreDomain } from '@interdomestik/domain-communications/messages/mark-read';
import { markMessagesReadSchema } from '@interdomestik/domain-communications/messages/schemas';
import type { Session } from './context';

export async function markMessagesAsReadCore(params: {
  session: NonNullable<Session> | null;
  messageIds: string[];
}) {
  const validation = markMessagesReadSchema.safeParse({ messageIds: params.messageIds });
  if (!validation.success) {
    const error = validation.error.flatten().fieldErrors.messageIds?.[0] || 'Invalid input';
    return { success: false, error };
  }

  return markMessagesAsReadCoreDomain(params);
}
