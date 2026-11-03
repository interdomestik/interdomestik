import { auth } from '@/lib/auth';
import { authorizeSessionTenant } from '@/lib/tenant-authority.server';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { headers } from 'next/headers';

export async function getAgentSession() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (session?.user?.role !== 'agent') {
    return null;
  }

  return session;
}

/** The tenant authority the current request's session grants; null when there is no tenant-bound session. */
export async function getAgentAuthority(): Promise<TenantAuthority | null> {
  try {
    const authorized = await authorizeSessionTenant(await headers());
    return authorized?.authority ?? null;
  } catch (error) {
    if ((error as { name?: unknown } | null)?.name !== 'MissingTenantError') throw error;
    return null;
  }
}
