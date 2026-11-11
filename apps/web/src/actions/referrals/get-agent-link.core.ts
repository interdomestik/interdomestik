import { getServerDeploymentOrigin } from '@/lib/deployment-origin.server';
import { getAgentReferralLinkCore as generateLink } from '@interdomestik/domain-referrals/referrals/get-agent-link';

export async function getAgentReferralLinkCore(
  params: Omit<Parameters<typeof generateLink>[0], 'appOrigin'>
): ReturnType<typeof generateLink> {
  return generateLink({ ...params, appOrigin: getServerDeploymentOrigin() });
}
