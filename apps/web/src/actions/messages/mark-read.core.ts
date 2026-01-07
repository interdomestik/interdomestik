import { enforceRateLimit } from '@/lib/rate-limit';
import { markMessagesAsReadCore as markMessagesAsReadCoreDomain } from '@interdomestik/domain-communications/messages/mark-read';
import { markMessagesReadSchema } from '@interdomestik/domain-communications/messages/schemas';
import type { Session } from './context';

export async function markMessagesAsReadCore(params: {
  session: NonNullable<Session> | null;
  messageIds: string[];
  requestHeaders: Headers;
}) {
  const validation = markMessagesReadSchema.safeParse({ messageIds: params.messageIds });
  if (!validation.success) {
    const error = validation.error.format().messageIds?._errors[0] || 'Invalid input'; // NOSONAR
    return { success: false, error };
  }

  if (params.session?.user?.id) {
    const rateLimit = await enforceRateLimit({
      name: `action:mark-messages-read:${params.session.user.id}`,
      limit: 60, // 60 requests per minute
      windowSeconds: 60,
      headers: params.requestHeaders,
    });
    if (rateLimit) {
      return { success: false, error: 'Too many requests' };
    }
  }

  return markMessagesAsReadCoreDomain(params);
}
