export type DeploymentEnvironment = 'production' | 'staging' | 'local';
export type DeploymentOrigin = Readonly<{
  environment: DeploymentEnvironment;
  origin: string;
}>;
export type DeploymentOriginEnv = Readonly<Record<string, string | undefined>>;
export type DeploymentOriginSnapshot = Readonly<{
  environment?: string;
  origin?: string;
}>;

export function resolveDeploymentOrigin(env?: DeploymentOriginEnv): DeploymentOrigin;
export function captureDeploymentOriginSnapshot(
  env?: DeploymentOriginEnv
): DeploymentOriginSnapshot;
export function validateDeploymentOriginSnapshot(
  snapshot: DeploymentOriginSnapshot
): DeploymentOrigin;
export function assertDeploymentOriginMatchesBuild(
  env: DeploymentOriginEnv,
  snapshot: DeploymentOriginSnapshot
): DeploymentOrigin;
