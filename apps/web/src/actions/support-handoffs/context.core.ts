import type { auth } from '@/lib/auth';
import { resolveStaffSupportSessionBranch } from '@/lib/support-handoffs/staff-session';
import { resolveMemberAcceptanceForRequest } from '@/lib/privacy/require-member-acceptance';
import { headers } from 'next/headers';

export type Session = Awaited<ReturnType<typeof auth.api.getSession>>;

export async function getActionContext() {
  const requestHeaders = await headers();
  const admission = await resolveMemberAcceptanceForRequest(requestHeaders);
  const authorized = admission.ok ? admission.authorized : null;
  const session = authorized?.session ?? null;
  const authority = authorized?.authority ?? null;
  return {
    ok: admission.ok,
    failure: admission.ok ? undefined : admission.failure,
    requestHeaders,
    authority,
    session: admission.ok
      ? ((await resolveStaffSupportSessionBranch(session, authority)) ?? session)
      : null,
  };
}
