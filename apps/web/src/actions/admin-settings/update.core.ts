import { requireTenantAdminSession } from '@interdomestik/domain-users/admin/access';
import type { UserSession } from '@interdomestik/domain-users/types';

import type { Session } from './context';

type AdminSettingsInput = {
  appName: string;
  supportEmail: string;
  autoAssign: boolean;
  defaultExpiry: number;
};

export async function adminUpdateSettingsCore(params: {
  session: Session | null;
  data: AdminSettingsInput;
}) {
  const { session, data } = params;

  await requireTenantAdminSession(session as unknown as UserSession | null);

  // NOTE: This is a stub for future global settings table
  console.log('Updating global settings:', data);

  return { success: true };
}
