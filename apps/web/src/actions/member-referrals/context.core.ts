import { auth } from '@/lib/auth';
import { authorizeSessionTenant } from '@/lib/tenant-authority.server';
import { headers } from 'next/headers';

export type Session = Awaited<ReturnType<typeof auth.api.getSession>>;

export async function getActionContext() {
  const requestHeaders = await headers();
  try {
    const authorized = await authorizeSessionTenant(requestHeaders);
    return {
      requestHeaders,
      session: authorized?.session ?? null,
      authority: authorized?.authority ?? null,
    };
  } catch (error) {
    if ((error as { name?: unknown } | null)?.name !== 'MissingTenantError') throw error;
    // A session without a tenant keeps its session so the cores answer with their own missing-tenant result.
    return {
      requestHeaders,
      session: await auth.api.getSession({ headers: requestHeaders }),
      authority: null,
    };
  }
}
