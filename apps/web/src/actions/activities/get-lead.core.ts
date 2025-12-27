import { getSessionFromHeaders } from './context';
import { getLeadActivitiesCore as getLeadActivitiesDomain } from '@interdomestik/domain-activities/get-lead';

export async function getLeadActivitiesCore(leadId: string) {
  const session = await getSessionFromHeaders();

  return getLeadActivitiesDomain({ session, leadId });
}
