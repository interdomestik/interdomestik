import { db } from '@interdomestik/database/db';
import { agentSettings } from '@interdomestik/database/schema';
import { eq } from 'drizzle-orm';

export interface AgentLayoutServices {
  db: {
    query: {
      agentSettings: {
        findFirst: (args: {
          where: ReturnType<typeof eq>;
          columns: { tier: true };
        }) => Promise<{ tier: string | null } | undefined>;
      };
    };
  };
}

export async function getAgentTierCore(
  params: { agentId: string },
  services: AgentLayoutServices
): Promise<string> {
  const settings = await services.db.query.agentSettings.findFirst({
    where: eq(agentSettings.agentId, params.agentId),
    columns: { tier: true },
  });

  return settings?.tier || 'standard';
}

export async function getAgentTier(params: { agentId: string }): Promise<string> {
  return getAgentTierCore(params, { db });
}
