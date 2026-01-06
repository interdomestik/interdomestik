import { revalidatePath } from 'next/cache';

import {
  logLeadActivityCore as logLeadActivityDomain,
  type LogLeadActivityInput,
} from '@interdomestik/domain-activities/log-lead';
import { getSessionFromHeaders } from './context';

export type { LogLeadActivityInput } from '@interdomestik/domain-activities/log-lead';

export async function logLeadActivityCore(data: LogLeadActivityInput) {
  const session = await getSessionFromHeaders();

  const result = await logLeadActivityDomain({ session, data });
  if ('error' in result) {
    return result;
  }

  revalidatePath(`/agent/crm/leads/${data.leadId}`);
  return { success: true };
}
