import type { auth } from '@/lib/auth';
import { authorizeSessionTenant } from '@/lib/tenant-authority.server';
import { headers } from 'next/headers';

export type Session = Awaited<ReturnType<typeof auth.api.getSession>>;

/** The request's authenticated session and the tenant authority it grants; nulls when unauthenticated. */
export async function getActionContext() {
  const authorized = await authorizeSessionTenant(await headers());
  return { session: authorized?.session ?? null, authority: authorized?.authority ?? null };
}
