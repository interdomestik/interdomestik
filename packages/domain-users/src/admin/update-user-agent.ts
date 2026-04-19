import { agentClients, db, eq, subscriptions, user } from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';
import { syncActiveAgentClientBinding } from '@interdomestik/domain-membership-billing';
import { and } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

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
      await tx
        .update(user)
        .set({ agentId })
        .where(withTenant(tenantId, user.tenantId, eq(user.id, userId)));

      await tx
        .update(subscriptions)
        .set({ agentId })
        .where(
          withTenant(
            tenantId,
            subscriptions.tenantId,
            and(eq(subscriptions.userId, userId), eq(subscriptions.status, 'active'))
          )
        );

      await syncActiveAgentClientBinding(tx, {
        tenantId,
        memberId: userId,
        agentId,
        idFactory: () => randomUUID(),
      });
    });

    return { success: true };
  } catch (error) {
    console.error('Failed to update user agent:', error);
    return { error: 'Failed to update user agent' };
  }
}
