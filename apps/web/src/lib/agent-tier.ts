import { db } from '@/lib/db.server';
import { agentSettings } from '@interdomestik/database/schema';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { and, eq } from 'drizzle-orm';

export type AgentTier = 'standard' | 'premium';

export type AgentTierResult = {
  tier: AgentTier;
  isPro: boolean;
};

export async function getAgentTier(
  session: { user?: { id?: string } } | null
): Promise<AgentTierResult> {
  if (!session?.user?.id) {
    return { tier: 'standard', isPro: false };
  }

  const tenantId = ensureTenantId(session as any);
  const settings = await db.query.agentSettings?.findFirst({
    where: and(eq(agentSettings.agentId, session.user.id), eq(agentSettings.tenantId, tenantId)),
  });

  const tier = (settings?.tier ?? 'standard') as AgentTier;
  return { tier, isPro: tier !== 'standard' };
}

export async function requireAgentPro(
  session: { user?: { id?: string } } | null
): Promise<AgentTierResult> {
  return getAgentTier(session);
}
