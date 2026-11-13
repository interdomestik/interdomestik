import { getServerDeploymentOrigin } from '@/lib/deployment-origin.server';

export function getDefaultAppUrl(): string {
  return getServerDeploymentOrigin();
}
