import { revalidatePath } from 'next/cache';

import {
  logLeadActivityCore as logLeadActivityDomain,
  type LogLeadActivityInput,
} from '@interdomestik/domain-activities/log-lead';
import { getAuthorizedActivityRequest } from './context';

export type { LogLeadActivityInput } from '@interdomestik/domain-activities/log-lead';

export async function logLeadActivityCore(data: LogLeadActivityInput) {
  const { session, authority } = await getAuthorizedActivityRequest();
  if (!session) {
    return { success: false as const, error: 'Unauthorized' };
  }

  const result = await logLeadActivityDomain({ session, authority, data });
  if (result.success) {
    revalidatePath(`/agent/crm/leads/${data.leadId}`);
  }

  return result;
}
