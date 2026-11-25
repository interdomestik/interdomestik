import { getAuthorizedActivityRequest } from './context';
import { getMemberActivitiesCore as getMemberActivitiesDomain } from '@interdomestik/domain-activities/get-member';

export async function getMemberActivitiesCore(memberId: string) {
  const { session, authority, failure } = await getAuthorizedActivityRequest();

  if (failure?.code === 'acceptance_required') throw new Error(failure.code);

  return getMemberActivitiesDomain({ session, authority, memberId });
}
