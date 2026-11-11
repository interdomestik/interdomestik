import { validateDeploymentOriginSnapshot } from '@interdomestik/domain-communications/deployment-origin';

// Only these validated public values are embedded by next.config. Never read browser authority.
export function getClientDeploymentOrigin(): string {
  return validateDeploymentOriginSnapshot({
    environment: process.env.INTERDOMESTIK_BUILT_DEPLOY_ENV,
    origin: process.env.INTERDOMESTIK_BUILT_DEPLOY_ORIGIN,
  }).origin;
}
