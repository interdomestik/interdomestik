import 'server-only';
import { resolveDeploymentOrigin } from '@interdomestik/domain-communications/deployment-origin';

export function getServerDeploymentOrigin(): string {
  return resolveDeploymentOrigin(process.env).origin;
}
