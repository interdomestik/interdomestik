import 'server-only';
import { assertDeploymentOriginMatchesBuild } from '@interdomestik/domain-communications/deployment-origin';

export function getServerDeploymentOrigin(): string {
  return assertDeploymentOriginMatchesBuild(process.env, {
    environment: process.env.INTERDOMESTIK_BUILT_DEPLOY_ENV,
    origin: process.env.INTERDOMESTIK_BUILT_DEPLOY_ORIGIN,
  }).origin;
}
