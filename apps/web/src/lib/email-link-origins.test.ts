import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EmailLinkOriginError, resolveTenantEmailOrigins } from './email-link-origins';

const CLEARED_KEYS = [
  'VERCEL_ENV',
  'VERCEL_TARGET_ENV',
  'INTERDOMESTIK_DEPLOY_ENV',
  'BETTER_AUTH_URL',
  'NEXT_PUBLIC_APP_URL',
  'KS_HOST',
  'MK_HOST',
  'AL_HOST',
  'PILOT_HOST',
];

function stub(env: Record<string, string>): void {
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
}

function refusal(): string | undefined {
  try {
    resolveTenantEmailOrigins('tenant_ks');
  } catch (error) {
    expect(error).toBeInstanceOf(EmailLinkOriginError);
    return (error as EmailLinkOriginError).reason;
  }
  return undefined;
}

const STAGING = 'https://staging.example.test';

describe('resolveTenantEmailOrigins', () => {
  beforeEach(() => {
    for (const key of CLEARED_KEYS) vi.stubEnv(key, '');
    vi.stubEnv('NODE_ENV', 'production');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses the canonical tenant host on a verified production deployment', () => {
    stub({ VERCEL_ENV: 'production', BETTER_AUTH_URL: 'https://www.interdomestik.com' });
    expect(resolveTenantEmailOrigins('tenant_ks')).toEqual({
      authOrigin: 'https://www.interdomestik.com',
      appOrigin: 'https://ks.interdomestik.com',
    });
  });

  it('keeps the production auth fallback only in production', () => {
    stub({ VERCEL_ENV: 'production' });
    expect(resolveTenantEmailOrigins('tenant_mk').authOrigin).toBe('https://www.interdomestik.com');
    stub({ VERCEL_ENV: 'preview' });
    expect(refusal()).toBe('missing_auth_origin');
  });

  it('returns a preview member to the preview deployment despite NODE_ENV=production', () => {
    stub({ VERCEL_ENV: 'preview', BETTER_AUTH_URL: STAGING });
    expect(resolveTenantEmailOrigins('tenant_ks')).toEqual({
      authOrigin: STAGING,
      appOrigin: STAGING,
    });
  });

  it('does not treat a non-production Vercel target as production', () => {
    stub({ VERCEL_ENV: 'production', VERCEL_TARGET_ENV: 'staging', BETTER_AUTH_URL: STAGING });
    expect(resolveTenantEmailOrigins('tenant_ks').appOrigin).toBe(STAGING);
  });

  it('honours the explicit deploy signal only without Vercel metadata', () => {
    stub({
      INTERDOMESTIK_DEPLOY_ENV: 'production',
      BETTER_AUTH_URL: 'https://www.interdomestik.com',
    });
    expect(resolveTenantEmailOrigins('tenant_ks').appOrigin).toBe('https://ks.interdomestik.com');
    stub({ VERCEL_ENV: 'preview', BETTER_AUTH_URL: STAGING });
    expect(resolveTenantEmailOrigins('tenant_ks').appOrigin).toBe(STAGING);
  });

  it('serves a local E2E lane from its own loopback origin or explicit tenant host', () => {
    stub({ BETTER_AUTH_URL: 'http://127.0.0.1:3310', NEXT_PUBLIC_APP_URL: STAGING });
    expect(resolveTenantEmailOrigins('tenant_ks').appOrigin).toBe('http://127.0.0.1:3310');
    stub({ KS_HOST: 'ks.127.0.0.1.nip.io:3310' });
    expect(resolveTenantEmailOrigins('tenant_ks').appOrigin).toBe(
      'http://ks.127.0.0.1.nip.io:3310'
    );
  });

  it.each([
    'https://user:secret@staging.example.test',
    '//staging.example.test',
    'javascript:alert(1)',
    'https://staging.example.test/members',
    'https://staging.example.test/?next=1',
    'https://staging.example.test/#x',
    'http://staging.example.test',
    'http://127.0.0.1.evil.test',
    'https://*.example.test',
    'https://a.example.test,b.example.test',
  ])('refuses the malformed auth origin %s', raw => {
    stub({ VERCEL_ENV: 'preview', BETTER_AUTH_URL: raw });
    expect(refusal()).toBe('invalid_auth_origin');
  });

  it('refuses production origins outside production', () => {
    stub({ VERCEL_ENV: 'preview', BETTER_AUTH_URL: 'https://www.interdomestik.com' });
    expect(refusal()).toBe('production_origin_outside_production');
    stub({ BETTER_AUTH_URL: STAGING, KS_HOST: 'ks.interdomestik.com' });
    expect(refusal()).toBe('production_origin_outside_production');
  });

  it.each([
    ['the shared front door', 'preview', 'staging.example.test'],
    ['an ida front door', 'preview', 'ida.example.test'],
    ["another tenant's canonical host", 'production', 'mk.interdomestik.com'],
    ["another tenant's local host", 'preview', 'mk.localhost'],
  ])('refuses %s as a tenant host', (_label, vercelEnv, host) => {
    stub({ VERCEL_ENV: vercelEnv, BETTER_AUTH_URL: STAGING, KS_HOST: host });
    expect(refusal()).toBe('conflicting_tenant_host');
  });

  it('refuses a tenant host duplicated by another tenant', () => {
    stub({ VERCEL_ENV: 'preview', BETTER_AUTH_URL: STAGING });
    stub({ KS_HOST: 'tenants.example.test', MK_HOST: 'tenants.example.test' });
    expect(refusal()).toBe('conflicting_tenant_host');
  });

  it.each(['ks.example.test/evil', 'ks.example.test?x=1', 'user@ks.example.test'])(
    'refuses the malformed tenant host %s',
    host => {
      stub({ VERCEL_ENV: 'preview', BETTER_AUTH_URL: STAGING, KS_HOST: host });
      expect(refusal()).toBe('invalid_tenant_host');
    }
  );

  it('refuses a loopback tenant host on a production deployment', () => {
    stub({ VERCEL_ENV: 'production', KS_HOST: 'ks.localhost:3000' });
    expect(refusal()).toBe('invalid_tenant_host');
  });
});
