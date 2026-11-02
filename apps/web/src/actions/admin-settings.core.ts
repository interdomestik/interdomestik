'use server';

import { revalidatePath } from 'next/cache';

import { authorizeSessionTenant } from '@/lib/tenant-authority.server';

import { getActionContext } from './admin-settings/context';
import { adminUpdateSettingsCore } from './admin-settings/update';

export async function adminUpdateSettings(data: {
  appName: string;
  supportEmail: string;
  autoAssign: boolean;
  defaultExpiry: number;
}) {
  const { requestHeaders, session } = await getActionContext();
  // The tenant RBAC grant check needs the session's own authority; a tenantless session has none.
  const authorized = session?.user?.tenantId
    ? await authorizeSessionTenant(requestHeaders).catch(() => null)
    : null;
  const result = await adminUpdateSettingsCore({
    session,
    authority: authorized?.authority ?? null,
    requestHeaders,
    data,
  });
  revalidatePath('/admin/settings');
  return result;
}
