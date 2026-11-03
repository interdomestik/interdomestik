import { revalidatePath } from 'next/cache';

import { logActivityCore as logActivityDomain } from '@interdomestik/domain-activities/log-member';
import type { LogActivityInput } from '@interdomestik/domain-activities/schema';
import { getAuthorizedActivityRequest } from './context';

export async function logActivityCore(data: LogActivityInput) {
  const { session, authority } = await getAuthorizedActivityRequest();
  if (!session) {
    return { success: false as const, error: 'Unauthorized' };
  }

  const result = await logActivityDomain({ session, authority, data });
  if (result.success) {
    revalidatePath(`/agent/crm/leads/${data.memberId}`);
    revalidatePath(`/admin/users/${data.memberId}`);
  }

  return result;
}
