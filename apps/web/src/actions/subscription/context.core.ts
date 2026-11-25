import { auth } from '@/lib/auth';
import { resolveMemberAcceptanceForRequest } from '@/lib/privacy/require-member-acceptance';
import { headers } from 'next/headers';

export type Session = Awaited<ReturnType<typeof auth.api.getSession>>;

export async function getActionContext() {
  const admission = await resolveMemberAcceptanceForRequest(await headers());
  const authorized = admission.ok ? admission.authorized : null;
  return {
    ok: admission.ok,
    failure: admission.ok ? undefined : admission.failure,
    session: authorized?.session ?? null,
    authority: authorized?.authority ?? null,
  };
}
