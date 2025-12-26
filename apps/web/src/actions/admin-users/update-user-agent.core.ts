import { agentClients, db, eq, user } from '@interdomestik/database';
import { randomUUID } from 'crypto';
import { revalidatePath } from 'next/cache';

import { requireAdminSession } from './access';
import type { Session } from './context';

export async function updateUserAgentCore(params: {
  session: NonNullable<Session> | null;
  userId: string;
  agentId: string | null;
}) {
  const { session, userId, agentId } = params;
  requireAdminSession(session);

  try {
    await db.transaction(async tx => {
      await tx.update(user).set({ agentId }).where(eq(user.id, userId));

      await tx
        .update(agentClients)
        .set({ status: 'inactive' })
        .where(eq(agentClients.memberId, userId));

      if (agentId) {
        await tx
          .insert(agentClients)
          .values({
            id: randomUUID(),
            agentId,
            memberId: userId,
            status: 'active',
            joinedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [agentClients.agentId, agentClients.memberId],
            set: { status: 'active', joinedAt: new Date() },
          });
      }
    });

    revalidatePath('/admin/users');
    return { success: true };
  } catch (error) {
    console.error('Failed to update user agent:', error);
    return { error: 'Failed to update user agent' };
  }
}
