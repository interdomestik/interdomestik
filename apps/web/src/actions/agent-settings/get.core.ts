import { agentSettings } from '@interdomestik/database/schema';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { and, eq } from 'drizzle-orm';

import type { ActionResult, AgentCommissionSettings, CommissionRates } from '../commissions.types';
import { canReadAgentSettings } from './access';
import type { Session } from './context';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

/** Get agent's commission settings */
export async function getAgentSettingsCore(params: {
  session: NonNullable<Session> | null;
  authority: TenantAuthority | null;
  agentId: string;
}): Promise<ActionResult<AgentCommissionSettings | null>> {
  const { session, authority, agentId } = params;

  if (!session?.user) return { success: false, error: 'Unauthorized' };
  if (!canReadAgentSettings({ session, agentId })) {
    return { success: false, error: 'Access denied' };
  }
  try {
    ensureTenantId(session);
  } catch {
    return { success: false, error: 'Missing tenantId' };
  }
  if (!authority) return { success: false, error: 'Unauthorized' };
  const { tenantId } = readTenantAuthority(authority);

  try {
    const settings = await withTenantAuthority(
      authority,
      async tx =>
        await tx.query.agentSettings?.findFirst({
          where: and(eq(agentSettings.agentId, agentId), eq(agentSettings.tenantId, tenantId)),
        })
    );

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
        minPayoutAmount: Number.parseFloat(settings.minPayoutAmount ?? '50'),
      },
    };
  } catch (error) {
    console.error('Error fetching agent settings:', error);
    return { success: false, error: 'Failed to fetch settings' };
  }
}
