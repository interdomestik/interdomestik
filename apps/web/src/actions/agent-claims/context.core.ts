import { auth } from '@/lib/auth';
import { authorizeSessionTenant } from '@/lib/tenant-authority.server';
import { headers } from 'next/headers';

export type Session = Awaited<ReturnType<typeof auth.api.getSession>>;

export async function getActionContext() {
  const requestHeaders = await headers();
  const authorized = await authorizeSessionTenant(requestHeaders);
  return {
    requestHeaders,
    session: authorized?.session ?? null,
    authority: authorized?.authority ?? null,
  };
}
