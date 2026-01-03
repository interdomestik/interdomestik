import { db } from '@interdomestik/database';
import { agentSettings } from '@interdomestik/database/schema';
import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { ensureTenantId } from '@interdomestik/shared-auth';

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
  let tenantId: string;
  try {
    tenantId = ensureTenantId(session);
  } catch {
    return { success: false, error: 'Missing tenantId' };
  }

  const normalizedRates: Record<string, number> = {};

  // Validate rates are between 0 and 1
  for (const [key, rate] of Object.entries(rates)) {
    if (typeof rate !== 'number') continue;
    if (!Number.isFinite(rate) || rate < 0 || rate > 1) {
      return { success: false, error: 'Rates must be between 0 and 1' };
    }
    normalizedRates[key] = rate;
  }

  try {
    const existing = await db.query.agentSettings?.findFirst({
      where: and(eq(agentSettings.agentId, agentId), eq(agentSettings.tenantId, tenantId)),
    });

    if (existing) {
      await db
        .update(agentSettings)
        .set({ commissionRates: normalizedRates, updatedAt: new Date() })
        .where(and(eq(agentSettings.agentId, agentId), eq(agentSettings.tenantId, tenantId)));
    } else {
      await db.insert(agentSettings).values({
        id: nanoid(),
        tenantId,
        agentId,
        commissionRates: normalizedRates,
      });
    }

    console.log(`[Commission] Updated rates for agent ${agentId}:`, normalizedRates);
    return { success: true };
  } catch (error) {
    console.error('Error updating commission rates:', error);
    return { success: false, error: 'Failed to update rates' };
  }
}
