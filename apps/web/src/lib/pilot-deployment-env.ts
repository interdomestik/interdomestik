import { releaseClass } from './runtime-environment';

const PRODUCTION_REFUSALS = [
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
];

export function assertPilotDeploymentEnv(env: Readonly<NodeJS.Dict<string>>): void {
  if (releaseClass(env) !== 'production') return;

  const refused = PRODUCTION_REFUSALS.filter(name => env[name]);
  if (env.IDENTITY_PUBLIC_SIGN_UP === 'open') refused.push('IDENTITY_PUBLIC_SIGN_UP');
  for (const name of Object.keys(env)) {
    if (env[name] && (name.startsWith('PADDLE_') || name.startsWith('NEXT_PUBLIC_PADDLE_'))) {
      refused.push(name);
    }
  }
  if (refused.length > 0) {
    throw new Error(`Production release refuses ${refused.sort().join(', ')}`);
  }
}
