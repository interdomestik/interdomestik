import {
  byCodeUnit,
  readPilotBuildEnvManifest,
  refusedPilotEnvNames,
} from './pilot-env-refusals.mjs';
import { releaseClass } from './runtime-environment';

export function assertPilotDeploymentEnv(
  env: Readonly<NodeJS.Dict<string>>,
  buildManifest: string | undefined
): void {
  if (releaseClass(env) !== 'production') {
    return;
  }

  const refused = new Set([
    ...readPilotBuildEnvManifest(buildManifest),
    ...refusedPilotEnvNames(env),
  ]);
  if (refused.size > 0) {
    throw new Error(`Production release refuses ${[...refused].sort(byCodeUnit).join(', ')}`);
  }
}
