import { eq, subscriptions, user } from '@interdomestik/database';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenant } from '@interdomestik/database/tenant-security';
import { revokeAgentClientReadScope } from '@interdomestik/domain-membership-billing';
import { and } from 'drizzle-orm';

import type { ActionResult, UserSession } from '../types';
import { requireTenantAdminSession } from './access';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

export async function updateUserAgentCore(params: {
  session: UserSession | null;
  authority: TenantAuthority | null;
  userId: string;
  agentId: string | null;
}): Promise<ActionResult> {
  const { session, authority, userId, agentId } = params;
  await requireTenantAdminSession(session);
  if (!authority) throw new Error('Unauthorized');

  const { tenantId } = readTenantAuthority(authority);

  try {
    await withTenantAuthority(authority, async tx => {
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

      await revokeAgentClientReadScope(tx, { tenantId, memberId: userId });
    });

    return { success: true };
  } catch (error) {
    console.error('Failed to update user agent:', error);
    return { error: 'Failed to update user agent' };
  }
}
