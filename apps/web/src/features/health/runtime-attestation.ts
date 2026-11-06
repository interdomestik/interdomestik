import 'server-only';

import {
  observeTenantClientAuthority,
  type RuntimeAuthorityObservation,
} from '@interdomestik/database/runtime-authority-observation';

/**
 * U2-e: the deployed tenant client's authority plus the configured DB_RLS_ROLE, which tenant
 * transactions would switch to. It is reported, never applied, so CD can refuse it.
 */
export async function observeDeployedRuntimeAuthority(): Promise<
  RuntimeAuthorityObservation & { configuredRole: string | null }
> {
  const observation = await observeTenantClientAuthority();
  return { ...observation, configuredRole: process.env.DB_RLS_ROLE?.trim() || null };
}
