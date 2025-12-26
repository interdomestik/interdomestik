import { db } from '@interdomestik/database';
import { agentSettings } from '@interdomestik/database/schema';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

import type { ActionResult, CommissionRates } from '../commissions.types';
import { isAdmin } from './access';
import type { Session } from './context';

/** Update agent's commission rates (admin only) */
export async function updateAgentCommissionRatesCore(params: {
  session: NonNullable<Session> | null;
  agentId: string;
  rates: CommissionRates;
}): Promise<ActionResult> {
  const { session, agentId, rates } = params;

  if (!session?.user) return { success: false, error: 'Unauthorized' };
  if (!isAdmin(session.user.role)) return { success: false, error: 'Admin access required' };

  // Validate rates are between 0 and 1
  for (const [, rate] of Object.entries(rates)) {
    if (rate < 0 || rate > 1) {
      return { success: false, error: 'Rates must be between 0 and 1' };
    }
  }

  try {
    const existing = await db.query.agentSettings?.findFirst({
      where: eq(agentSettings.agentId, agentId),
    });

    if (existing) {
      await db
        .update(agentSettings)
        .set({ commissionRates: rates, updatedAt: new Date() })
        .where(eq(agentSettings.agentId, agentId));
    } else {
      await db.insert(agentSettings).values({
        id: nanoid(),
        agentId,
        commissionRates: rates,
      });
    }

    console.log(`[Commission] Updated rates for agent ${agentId}:`, rates);
    return { success: true };
  } catch (error) {
    console.error('Error updating commission rates:', error);
    return { success: false, error: 'Failed to update rates' };
  }
}
