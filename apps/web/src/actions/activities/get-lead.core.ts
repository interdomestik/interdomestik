import { getAuthorizedActivityRequest } from './context';
import { getLeadActivitiesCore as getLeadActivitiesDomain } from '@interdomestik/domain-activities/get-lead';

export async function getLeadActivitiesCore(leadId: string) {
  const { session, authority } = await getAuthorizedActivityRequest();

  return getLeadActivitiesDomain({ session, authority, leadId });
}
