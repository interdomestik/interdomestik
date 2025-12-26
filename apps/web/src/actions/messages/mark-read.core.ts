import { claimMessages, db } from '@interdomestik/database';
import { and, eq, isNull } from 'drizzle-orm';

import type { Session } from './context';

/**
 * Mark messages as read.
 */
export async function markMessagesAsReadCore(params: {
  session: NonNullable<Session> | null;
  messageIds: string[];
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { session, messageIds } = params;

    if (!session?.user) {
      return { success: false, error: 'Unauthorized' };
    }

    if (messageIds.length === 0) {
      return { success: true };
    }

    for (const messageId of messageIds) {
      await db
        .update(claimMessages)
        .set({ readAt: new Date() })
        .where(and(eq(claimMessages.id, messageId), isNull(claimMessages.readAt)));
    }

    return { success: true };
  } catch (error) {
    console.error('Error marking messages as read:', error);
    return { success: false, error: 'Failed to mark messages as read' };
  }
}
