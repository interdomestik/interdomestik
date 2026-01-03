import { db } from '@interdomestik/database';
import { agentSettings } from '@interdomestik/database/schema';
import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { ensureTenantId } from '@interdomestik/shared-auth';

import type { ActionResult } from '../commissions.types';
import { isAdmin } from './access';
import type { Session } from './context';

/** Update agent tier (admin only) */
export async function updateAgentTierCore(params: {
  session: NonNullable<Session> | null;
  agentId: string;
  tier: 'standard' | 'premium' | 'vip';
}): Promise<ActionResult> {
  const { session, agentId, tier } = params;

  if (!session?.user) return { success: false, error: 'Unauthorized' };
  if (!isAdmin(session.user.role)) return { success: false, error: 'Admin access required' };
  let tenantId: string;
  try {
    tenantId = ensureTenantId(session);
  } catch {
    return { success: false, error: 'Missing tenantId' };
  }

  try {
    const existing = await db.query.agentSettings?.findFirst({
      where: and(eq(agentSettings.agentId, agentId), eq(agentSettings.tenantId, tenantId)),
    });

    if (existing) {
      await db
        .update(agentSettings)
        .set({ tier, updatedAt: new Date() })
        .where(and(eq(agentSettings.agentId, agentId), eq(agentSettings.tenantId, tenantId)));
    } else {
      await db.insert(agentSettings).values({
        id: nanoid(),
        tenantId,
        agentId,
        tier,
        commissionRates: {},
      });
    }

    console.log(`[Commission] Updated tier for agent ${agentId}: ${tier}`);
    return { success: true };
  } catch (error) {
    console.error('Error updating agent tier:', error);
    return { success: false, error: 'Failed to update tier' };
  }
}
