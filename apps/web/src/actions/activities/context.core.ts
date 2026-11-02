import { authorizeSessionTenant } from '@/lib/tenant-authority.server';
import { headers } from 'next/headers';

/** The request's authenticated session and the tenant authority it grants; nulls when unauthenticated. */
export async function getAuthorizedActivityRequest() {
  const authorized = await authorizeSessionTenant(await headers());
  return { session: authorized?.session ?? null, authority: authorized?.authority ?? null };
}
