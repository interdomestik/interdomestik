import { revalidatePath } from 'next/cache';

import { getSessionFromHeaders } from './context';
import { logActivityCore as logActivityDomain } from '@interdomestik/domain-activities/log-member';
import type { LogActivityInput } from '@interdomestik/domain-activities/schema';

export async function logActivityCore(data: LogActivityInput) {
  const session = await getSessionFromHeaders();

  const result = await logActivityDomain({ session, data });
  if ('error' in result) return result;

  revalidatePath(`/agent/crm/leads/${data.memberId}`);
  revalidatePath(`/admin/users/${data.memberId}`);

  return result;
}
