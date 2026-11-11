import { getServerDeploymentOrigin } from '@/lib/deployment-origin.server';
import { getMemberReferralLinkCore as generateLink } from '@interdomestik/domain-referrals/member-referrals/link';

export async function getMemberReferralLinkCore(
  params: Omit<Parameters<typeof generateLink>[0], 'appOrigin'>
): ReturnType<typeof generateLink> {
  return generateLink({ ...params, appOrigin: getServerDeploymentOrigin() });
}
