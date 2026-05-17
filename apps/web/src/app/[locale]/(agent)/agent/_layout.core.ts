import { db } from '@interdomestik/database/db';
import { agentSettings } from '@interdomestik/database/schema';
import { and, eq } from 'drizzle-orm';

export interface AgentLayoutServices {
  db: {
    query: {
      agentSettings: {
        findFirst: (args: {
          where: ReturnType<typeof and>;
          columns: { tier: true };
        }) => Promise<{ tier: string | null } | undefined>;
      };
    };
  };
}

export async function getAgentTierCore(
  params: { agentId: string; tenantId?: string | null },
  services: AgentLayoutServices
): Promise<string> {
  if (!params.tenantId) {
    return 'standard';
  }

  const settings = await services.db.query.agentSettings.findFirst({
    where: and(
      eq(agentSettings.agentId, params.agentId),
      eq(agentSettings.tenantId, params.tenantId)
    ),
    columns: { tier: true },
  });

  return settings?.tier || 'standard';
}

export async function getAgentTier(params: {
  agentId: string;
  tenantId?: string | null;
}): Promise<string> {
  return getAgentTierCore(params, { db });
}
