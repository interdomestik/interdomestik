'use server';

import { auth } from '@/lib/auth';
import { db } from '@interdomestik/database';
import { agentSettings } from '@interdomestik/database/schema';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { headers } from 'next/headers';

import { ActionResult, AgentCommissionSettings, CommissionRates } from './commissions.types';

async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

function isAdmin(role: string): boolean {
  return role === 'admin';
}

/** Get agent's commission settings */
export async function getAgentSettings(
  agentId: string
): Promise<ActionResult<AgentCommissionSettings | null>> {
  const session = await getSession();
  if (!session?.user) return { success: false, error: 'Unauthorized' };
  if (!isAdmin(session.user.role) && session.user.id !== agentId) {
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

/** Update agent's commission rates (admin only) */
export async function updateAgentCommissionRates(
  agentId: string,
  rates: CommissionRates
): Promise<ActionResult> {
  const session = await getSession();
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

/** Update agent tier (admin only) */
export async function updateAgentTier(
  agentId: string,
  tier: 'standard' | 'premium' | 'vip'
): Promise<ActionResult> {
  const session = await getSession();
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
