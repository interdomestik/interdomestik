import { agentSettings } from '@interdomestik/database/schema';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

import type { ActionResult, CommissionRates } from '../commissions.types';
import { isAdmin } from './access';
import type { Session } from './context';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

/** Update agent's commission rates (admin only) */
export async function updateAgentCommissionRatesCore(params: {
  session: NonNullable<Session> | null;
  authority: TenantAuthority | null;
  agentId: string;
  rates: CommissionRates;
}): Promise<ActionResult> {
  const { session, authority, agentId, rates } = params;

  if (!session?.user) return { success: false, error: 'Unauthorized' };
  if (!isAdmin(session.user.role)) return { success: false, error: 'Admin access required' };
  try {
    ensureTenantId(session);
  } catch {
    return { success: false, error: 'Missing tenantId' };
  }
  if (!authority) return { success: false, error: 'Unauthorized' };
  const { tenantId } = readTenantAuthority(authority);

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
    const existing = await withTenantAuthority(authority, async tx =>
      tx.query.agentSettings?.findFirst({
        where: and(eq(agentSettings.agentId, agentId), eq(agentSettings.tenantId, tenantId)),
      })
    );

    if (existing) {
      await withTenantAuthority(authority, async tx =>
        tx
          .update(agentSettings)
          .set({ commissionRates: normalizedRates, updatedAt: new Date() })
          .where(and(eq(agentSettings.agentId, agentId), eq(agentSettings.tenantId, tenantId)))
      );
    } else {
      // db-access-guard: tenant-scoped -- reason: tenantId from validated session or authScope in current call path
      await withTenantAuthority(authority, async tx =>
        tx.insert(agentSettings).values({
          id: nanoid(),
          tenantId,
          agentId,
          commissionRates: normalizedRates,
        })
      );
    }

    return { success: true };
  } catch (error) {
    console.error('Error updating commission rates:', error);
    return { success: false, error: 'Failed to update rates' };
  }
}
