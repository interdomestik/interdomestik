import { auth } from '@/lib/auth';
import { resolveStaffSupportSessionBranch } from '@/lib/support-handoffs/staff-session';
import { authorizeSessionTenant } from '@/lib/tenant-authority.server';
import { headers } from 'next/headers';

export type Session = Awaited<ReturnType<typeof auth.api.getSession>>;

export async function getActionContext() {
  const requestHeaders = await headers();
  const authorized = await authorizeSessionTenant(requestHeaders);
  const session = authorized?.session ?? null;
  const authority = authorized?.authority ?? null;
  return {
    requestHeaders,
    authority,
    session: (await resolveStaffSupportSessionBranch(session, authority)) ?? session,
  };
}
