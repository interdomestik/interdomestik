import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { agentSettings } from '@interdomestik/database/schema';
import { and, eq } from 'drizzle-orm';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

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
  /** The session's tenant authority; null for a session that carries no tenant. */
  authority: TenantAuthority | null;
}): Promise<string> {
  const { agentId, authority } = params;
  if (!authority) {
    return 'standard';
  }

  const { tenantId } = readTenantAuthority(authority);
  return withTenantAuthority(authority, tx => getAgentTierCore({ agentId, tenantId }, { db: tx }));
}
