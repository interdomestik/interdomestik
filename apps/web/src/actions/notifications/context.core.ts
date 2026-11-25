import { auth } from '@/lib/auth';
import { resolveMemberAcceptanceForRequest } from '@/lib/privacy/require-member-acceptance';
import { headers } from 'next/headers';

export type Session = Awaited<ReturnType<typeof auth.api.getSession>>;

export async function getActionContext() {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  return { session, requestHeaders };
}

export async function getAuthorizedActionContext() {
  const requestHeaders = await headers();
  const admission = await resolveMemberAcceptanceForRequest(requestHeaders);
  if (!admission.ok && admission.failure.code === 'acceptance_required') {
    throw new Error(admission.failure.code);
  }
  return {
    session: admission.ok ? admission.authorized.session : null,
    authority: admission.ok ? admission.authorized.authority : null,
    requestHeaders,
  };
}
