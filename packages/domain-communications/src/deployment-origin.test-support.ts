import { vi } from 'vitest';

export const STAGING_DOOR = 'https://staging.interdomestik.com';
export const PRODUCTION_DOOR = 'https://ida.interdomestik.com';

export function stubDeploymentOrigin(environment = 'staging', origin = STAGING_DOOR): void {
  for (const key of [
    'VERCEL_ENV',
    'VERCEL_TARGET_ENV',
    'VERCEL_URL',
    'KS_HOST',
    'MK_HOST',
    'AL_HOST',
    'PILOT_HOST',
    'NEXT_PUBLIC_SITE_URL',
  ])
    vi.stubEnv(key, undefined);
  vi.stubEnv('INTERDOMESTIK_DEPLOY_ENV', undefined);
  vi.stubEnv(
    'VERCEL_ENV',
    environment === 'local' ? undefined : environment === 'staging' ? 'preview' : 'production'
  );
  vi.stubEnv('NEXT_PUBLIC_APP_URL', origin);
  vi.stubEnv('BETTER_AUTH_URL', `${origin}/api/auth`);
  vi.stubEnv('IDA_HOST', new URL(origin).host);
}
