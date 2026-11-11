import { resolvePublicDeploymentOrigin } from '@interdomestik/domain-communications/deployment-origin';

// Next embeds this existing public input. Never read browser authority or server configuration.
export function getClientDeploymentOrigin(): string {
  return resolvePublicDeploymentOrigin(process.env.NEXT_PUBLIC_APP_URL).origin;
}
