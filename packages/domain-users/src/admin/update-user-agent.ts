import { agentClients, and, db, eq, user } from '@interdomestik/database';
import { randomUUID } from 'crypto';

import type { ActionResult, UserSession } from '../types';
import { requireTenantAdminSession } from './access';
import { ensureTenantId } from '@interdomestik/shared-auth';

export async function updateUserAgentCore(params: {
  session: UserSession | null;
  userId: string;
  agentId: string | null;
}): Promise<ActionResult> {
  const { session, userId, agentId } = params;
  await requireTenantAdminSession(session);

  const tenantId = ensureTenantId(session);

  try {
    await db.transaction(async tx => {
      await tx.update(user).set({ agentId }).where(eq(user.id, userId));

      await tx
        .update(agentClients)
        .set({ status: 'inactive' })
        .where(and(eq(agentClients.memberId, userId), eq(agentClients.tenantId, tenantId)));

      if (agentId) {
        await tx
          .insert(agentClients)
          .values({
            id: randomUUID(),
            tenantId,
            agentId,
            memberId: userId,
            status: 'active',
            joinedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [agentClients.tenantId, agentClients.agentId, agentClients.memberId],
            set: { status: 'active', joinedAt: new Date() },
          });
      }
    });

    return { success: true };
  } catch (error) {
    console.error('Failed to update user agent:', error);
    return { error: 'Failed to update user agent' };
  }
}
