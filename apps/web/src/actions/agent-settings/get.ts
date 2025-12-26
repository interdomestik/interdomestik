import { db } from '@interdomestik/database';
import { agentSettings } from '@interdomestik/database/schema';
import { eq } from 'drizzle-orm';

import type { ActionResult, AgentCommissionSettings, CommissionRates } from '../commissions.types';
import { canReadAgentSettings } from './access';
import type { Session } from './context';

/** Get agent's commission settings */
export async function getAgentSettingsCore(params: {
  session: NonNullable<Session> | null;
  agentId: string;
}): Promise<ActionResult<AgentCommissionSettings | null>> {
  const { session, agentId } = params;

  if (!session?.user) return { success: false, error: 'Unauthorized' };
  if (!canReadAgentSettings({ session, agentId })) {
    return { success: false, error: 'Access denied' };
  }

  try {
    const settings = await db.query.agentSettings?.findFirst({
      where: eq(agentSettings.agentId, agentId),
    });

    if (!settings) {
      return { success: true, data: null };
    }

    return {
      success: true,
      data: {
        agentId: settings.agentId,
        commissionRates: settings.commissionRates as CommissionRates,
        tier: (settings.tier ?? 'standard') as 'standard' | 'premium' | 'vip',
        canNegotiateRates: settings.canNegotiateRates,
        minPayoutAmount: parseFloat(settings.minPayoutAmount ?? '50'),
      },
    };
  } catch (error) {
    console.error('Error fetching agent settings:', error);
    return { success: false, error: 'Failed to fetch settings' };
  }
}
