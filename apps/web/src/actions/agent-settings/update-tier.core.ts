import { agentSettings } from '@interdomestik/database/schema';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

import type { ActionResult } from '../commissions.types';
import { isAdmin } from './access';
import type { Session } from './context';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

/** Update agent tier (admin only) */
export async function updateAgentTierCore(params: {
  session: NonNullable<Session> | null;
  authority: TenantAuthority | null;
  agentId: string;
  tier: 'standard' | 'premium' | 'vip';
}): Promise<ActionResult> {
  const { session, authority, agentId, tier } = params;

  if (!session?.user) return { success: false, error: 'Unauthorized' };
  if (!isAdmin(session.user.role)) return { success: false, error: 'Admin access required' };
  try {
    ensureTenantId(session);
  } catch {
    return { success: false, error: 'Missing tenantId' };
  }
  if (!authority) return { success: false, error: 'Unauthorized' };
  const { tenantId } = readTenantAuthority(authority);

  try {
    const existing = await withTenantAuthority(
      authority,
      async tx =>
        await tx.query.agentSettings?.findFirst({
          where: and(eq(agentSettings.agentId, agentId), eq(agentSettings.tenantId, tenantId)),
        })
    );

    if (existing) {
      await withTenantAuthority(
        authority,
        async tx =>
          await tx
            .update(agentSettings)
            .set({ tier, updatedAt: new Date() })
            .where(and(eq(agentSettings.agentId, agentId), eq(agentSettings.tenantId, tenantId)))
      );
    } else {
      // db-access-guard: tenant-scoped -- reason: tenantId from validated session or authScope in current call path
      await withTenantAuthority(
        authority,
        async tx =>
          await tx.insert(agentSettings).values({
            id: nanoid(),
            tenantId,
            agentId,
            tier,
            commissionRates: {},
          })
      );
    }

    return { success: true };
  } catch (error) {
    console.error('Error updating agent tier:', error);
    return { success: false, error: 'Failed to update tier' };
  }
}
