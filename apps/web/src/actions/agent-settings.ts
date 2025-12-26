'use server';

import type { ActionResult, AgentCommissionSettings, CommissionRates } from './commissions.types';

import { getActionContext } from './agent-settings/context';
import { getAgentSettingsCore } from './agent-settings/get';
import { updateAgentCommissionRatesCore } from './agent-settings/update-rates';
import { updateAgentTierCore } from './agent-settings/update-tier';

/** Get agent's commission settings */
export async function getAgentSettings(
  agentId: string
): Promise<ActionResult<AgentCommissionSettings | null>> {
  const { session } = await getActionContext();
  return getAgentSettingsCore({ session, agentId });
}

/** Update agent's commission rates (admin only) */
export async function updateAgentCommissionRates(
  agentId: string,
  rates: CommissionRates
): Promise<ActionResult> {
  const { session } = await getActionContext();
  return updateAgentCommissionRatesCore({ session, agentId, rates });
}

/** Update agent tier (admin only) */
export async function updateAgentTier(
  agentId: string,
  tier: 'standard' | 'premium' | 'vip'
): Promise<ActionResult> {
  const { session } = await getActionContext();
  return updateAgentTierCore({ session, agentId, tier });
}
