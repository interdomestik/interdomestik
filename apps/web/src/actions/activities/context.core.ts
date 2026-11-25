import { resolveMemberAcceptanceForRequest } from '@/lib/privacy/require-member-acceptance';
import { headers } from 'next/headers';

/** The request's authenticated session and the tenant authority it grants; nulls when unauthenticated. */
export async function getAuthorizedActivityRequest() {
  const admission = await resolveMemberAcceptanceForRequest(await headers());
  const authorized = admission.ok ? admission.authorized : null;
  return {
    ok: admission.ok,
    failure: admission.ok ? undefined : admission.failure,
    session: authorized?.session ?? null,
    authority: authorized?.authority ?? null,
  };
}
