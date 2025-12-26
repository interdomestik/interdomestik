import { db } from '@interdomestik/database';
import { agentSettings } from '@interdomestik/database/schema';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

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

  try {
    const existing = await db.query.agentSettings?.findFirst({
      where: eq(agentSettings.agentId, agentId),
    });

    if (existing) {
      await db
        .update(agentSettings)
        .set({ tier, updatedAt: new Date() })
        .where(eq(agentSettings.agentId, agentId));
    } else {
      await db.insert(agentSettings).values({
        id: nanoid(),
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
