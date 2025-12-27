import { getSessionFromHeaders } from './context';
import { getMemberActivitiesCore as getMemberActivitiesDomain } from '@interdomestik/domain-activities/get-member';

export async function getMemberActivitiesCore(memberId: string) {
  const session = await getSessionFromHeaders();

  return getMemberActivitiesDomain({ session, memberId });
}
