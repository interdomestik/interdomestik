export type DeploymentEnvironment = 'production' | 'staging' | 'local';
export type DeploymentOrigin = Readonly<{
  environment: DeploymentEnvironment;
  origin: string;
}>;
export type DeploymentOriginEnv = Readonly<Record<string, string | undefined>>;

export function resolveDeploymentOrigin(env?: DeploymentOriginEnv): DeploymentOrigin;
export function resolvePublicDeploymentOrigin(origin: string | undefined): DeploymentOrigin;
