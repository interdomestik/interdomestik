import { auth } from '@/lib/auth';
import { authorizeSessionTenant } from '@/lib/tenant-authority.server';
import { headers } from 'next/headers';

export type Session = Awaited<ReturnType<typeof auth.api.getSession>>;

export async function getActionContext() {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  return { session, requestHeaders };
}

/** The request's authenticated session and the tenant authority it grants; nulls when unauthenticated. */
export async function getAuthorizedActionContext() {
  const requestHeaders = await headers();
  const authorized = await authorizeSessionTenant(requestHeaders);
  return {
    session: authorized?.session ?? null,
    authority: authorized?.authority ?? null,
    requestHeaders,
  };
}
