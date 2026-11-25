import type { auth } from '@/lib/auth';
import { resolveMemberAcceptanceForRequest } from '@/lib/privacy/require-member-acceptance';
import { headers } from 'next/headers';

export type Session = Awaited<ReturnType<typeof auth.api.getSession>>;

export async function getActionContext() {
  const requestHeaders = await headers();
  const admission = await resolveMemberAcceptanceForRequest(requestHeaders);
  return {
    ok: admission.ok,
    failure: admission.ok ? undefined : admission.failure,
    requestHeaders,
    session: admission.ok ? admission.authorized.session : null,
    authority: admission.ok ? admission.authorized.authority : null,
  };
}
