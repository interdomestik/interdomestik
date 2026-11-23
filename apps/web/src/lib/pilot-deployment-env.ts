import { releaseClass } from './runtime-environment';

const PRODUCTION_REFUSALS = new Set([
  'GITHUB_CLIENT_ID',
  'GITHUB_CLIENT_SECRET',
  'E2E_API_SECRET',
  'E2E_SMTP_HOST',
  'E2E_SMTP_PORT',
  'PLAYWRIGHT',
  'INTERDOMESTIK_AUTOMATED',
  'NEXT_PUBLIC_INTERDOMESTIK_AUTOMATED',
  'INTERDOMESTIK_LOCAL_E2E',
  'INTERDOMESTIK_E2E_DIAGNOSTICS',
  'INTERDOMESTIK_E2E_FAKE_STORAGE_SIGNING',
  'BILLING_TEST_MODE',
  'NEXT_PUBLIC_BILLING_TEST_MODE',
]);

function refusesNonEmptyValue(name: string): boolean {
  return (
    PRODUCTION_REFUSALS.has(name) ||
    name.startsWith('PADDLE_') ||
    name.startsWith('NEXT_PUBLIC_PADDLE_')
  );
}

// Code-unit order: the same deterministic order as the default sort, stated explicitly.
function byCodeUnit(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}
export function refusedPilotEnvNames(env: Readonly<NodeJS.Dict<string>>): string[] {
  const refused = Object.keys(env).filter(name => env[name] && refusesNonEmptyValue(name));
  if (env.IDENTITY_PUBLIC_SIGN_UP === 'open') {
    refused.push('IDENTITY_PUBLIC_SIGN_UP');
  }
  return refused.sort(byCodeUnit);
}

function readBuildManifest(manifest: string | undefined): string[] {
  const invalidManifest =
    'Production release requires a valid INTERDOMESTIK_BUILT_PILOT_ENV manifest.';
  let names: unknown;
  try {
    names = JSON.parse(manifest ?? '');
  } catch {
    throw new Error(invalidManifest);
  }
  if (
    !Array.isArray(names) ||
    !names.every(
      name =>
        typeof name === 'string' && name.startsWith('NEXT_PUBLIC_') && refusesNonEmptyValue(name)
    )
  ) {
    throw new Error(invalidManifest);
  }
  return names;
}

export function assertPilotDeploymentEnv(
  env: Readonly<NodeJS.Dict<string>>,
  buildManifest: string | undefined
): void {
  if (releaseClass(env) !== 'production') {
    return;
  }

  const refused = new Set([...readBuildManifest(buildManifest), ...refusedPilotEnvNames(env)]);
  if (refused.size > 0) {
    throw new Error(`Production release refuses ${[...refused].sort(byCodeUnit).join(', ')}`);
  }
}
