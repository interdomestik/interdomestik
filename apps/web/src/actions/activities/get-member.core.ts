import { getAuthorizedActivityRequest } from './context';
import { getMemberActivitiesCore as getMemberActivitiesDomain } from '@interdomestik/domain-activities/get-member';

export async function getMemberActivitiesCore(memberId: string) {
  const { session, authority } = await getAuthorizedActivityRequest();

  return getMemberActivitiesDomain({ session, authority, memberId });
}
