import { afterEach, describe, expect, it } from 'vitest';

import {
  hasPositiveProductionSignal,
  isAutomatedRuntime,
  isBillingTestActivationEnabled,
  isE2EDiagnosticsEnabled,
  isLocalE2ERuntime,
  isProductionDeployment,
  releaseClass,
} from './runtime-environment';

const loopbackDatabaseEnv = {
  DATABASE_URL: 'postgres://fixture@127.0.0.1/test',
  DATABASE_URL_RLS: 'postgres://runtime@127.0.0.1/test',
};
const localE2eEnv = {
  ...loopbackDatabaseEnv,
  NODE_ENV: 'production',
  PLAYWRIGHT: '1',
  INTERDOMESTIK_LOCAL_E2E: '1',
};
const stagingEnv = { VERCEL: '1', VERCEL_ENV: 'preview' };

describe('hasPositiveProductionSignal', () => {
  it.each([
    [{}, false],
    [{ NODE_ENV: 'production' }, false],
    [localE2eEnv, false],
    [stagingEnv, false],
    [{ VERCEL_ENV: ' Production ' }, true],
    [{ VERCEL_TARGET_ENV: ' PRODUCTION ' }, true],
    [{ INTERDOMESTIK_PRODUCTION: '1' }, true],
    [{ INTERDOMESTIK_PRODUCTION: ' 1 ' }, false],
    [{ INTERDOMESTIK_PRODUCTION: 'true' }, false],
    [{ INTERDOMESTIK_DEPLOY_ENV: ' pRoDuCtIoN ' }, true],
    [{ INTERDOMESTIK_DEPLOY_ENV: 'staging', VERCEL_TARGET_ENV: 'preview' }, false],
  ])('classifies %j as %s', (env, expected) => {
    expect(hasPositiveProductionSignal(env)).toBe(expected);
  });
});

describe('releaseClass', () => {
  it.each([
    ['development', { NODE_ENV: 'development', ...loopbackDatabaseEnv }, 'development'],
    ['test', { NODE_ENV: 'test', ...loopbackDatabaseEnv }, 'development'],
    ['built E2E on loopback', localE2eEnv, 'local-e2e'],
    [
      'built E2E on loopback with explicit target',
      { ...localE2eEnv, INTERDOMESTIK_DEPLOY_ENV: 'development' },
      'local-e2e',
    ],
    [
      'built E2E in the confirmed CI container',
      {
        ...localE2eEnv,
        DATABASE_URL: 'postgres://fixture@ci-postgres/test',
        DATABASE_URL_RLS: 'postgres://runtime@ci-postgres/test',
        SEED_TARGET_CONFIRM: 'plan070:ci-postgres',
      },
      'local-e2e',
    ],
    ['hosted staging', stagingEnv, 'staging'],
    [
      'staging URL without the host flag',
      { VERCEL_URL: 'preview.example.test', VERCEL_ENV: 'preview' },
      'staging',
    ],
    ['explicit staging target', { ...stagingEnv, INTERDOMESTIK_DEPLOY_ENV: 'staging' }, 'staging'],
    ['explicit preview target', { ...stagingEnv, INTERDOMESTIK_DEPLOY_ENV: 'preview' }, 'staging'],
    [
      'preview of a production target',
      { ...stagingEnv, VERCEL_TARGET_ENV: 'production' },
      'production',
    ],
    ['hosted without an environment', { ...localE2eEnv, VERCEL: '1' }, 'production'],
    ['preview without hosting marker', { VERCEL_ENV: 'preview' }, 'production'],
    [
      'preview with an unexpected target',
      { ...stagingEnv, INTERDOMESTIK_DEPLOY_ENV: 'development' },
      'production',
    ],
    ['standalone next start', { NODE_ENV: 'production', ...loopbackDatabaseEnv }, 'production'],
    ['missing admin URL', { ...localE2eEnv, DATABASE_URL: undefined }, 'production'],
    ['missing RLS URL', { ...localE2eEnv, DATABASE_URL_RLS: undefined }, 'production'],
    [
      'remote admin URL',
      { ...localE2eEnv, DATABASE_URL: 'postgres://fixture@outside.invalid/db' },
      'production',
    ],
    [
      'remote RLS URL',
      { ...localE2eEnv, DATABASE_URL_RLS: 'postgres://runtime@outside.invalid/db' },
      'production',
    ],
    ['malformed URL', { ...localE2eEnv, DATABASE_URL_RLS: 'invalid' }, 'production'],
    [
      'local E2E with explicit staging target',
      { ...localE2eEnv, INTERDOMESTIK_DEPLOY_ENV: 'staging' },
      'production',
    ],
  ])('classifies %s correctly', (_description, env, expected) => {
    expect(releaseClass(env)).toBe(expected);
  });

  it.each([
    ['VERCEL_ENV', 'production'],
    ['VERCEL_TARGET_ENV', 'production'],
    ['INTERDOMESTIK_PRODUCTION', '1'],
    ['INTERDOMESTIK_DEPLOY_ENV', 'production'],
  ])('gives production precedence for %s=%s', (key, value) => {
    for (const env of [{}, localE2eEnv, stagingEnv]) {
      expect(releaseClass({ ...env, [key]: value })).toBe('production');
    }
  });
});

describe('runtime-environment', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
  });

  function withEnv(env: NodeJS.ProcessEnv) {
    process.env = { ...originalEnv, ...env };
  }

  it('treats plain NODE_ENV production as production deployment', () => {
    withEnv({ NODE_ENV: 'production' });

    delete process.env.CI;
    delete process.env.PLAYWRIGHT;
    delete process.env.INTERDOMESTIK_AUTOMATED;

    expect(isProductionDeployment()).toBe(true);
  });

  it('keeps NODE_ENV production fail-closed even when generic automation flags are present', () => {
    withEnv({ NODE_ENV: 'production', PLAYWRIGHT: '1' });

    expect(isAutomatedRuntime()).toBe(true);
    expect(isProductionDeployment()).toBe(true);
    expect(isE2EDiagnosticsEnabled()).toBe(false);
  });

  it('treats Vercel production as production even when NODE_ENV differs', () => {
    withEnv({ NODE_ENV: 'development', VERCEL_ENV: 'production' });

    expect(isProductionDeployment()).toBe(true);
  });

  it('requires server-side billing flag outside automated runs', () => {
    withEnv({ NODE_ENV: 'development', NEXT_PUBLIC_BILLING_TEST_MODE: '1' });

    delete process.env.BILLING_TEST_MODE;
    delete process.env.CI;
    delete process.env.PLAYWRIGHT;
    delete process.env.INTERDOMESTIK_AUTOMATED;

    expect(isBillingTestActivationEnabled()).toBe(false);

    process.env.BILLING_TEST_MODE = '1';
    expect(isBillingTestActivationEnabled()).toBe(true);
  });

  it('enables diagnostics and billing test activation only for explicit local E2E runtime', () => {
    withEnv({
      NODE_ENV: 'production',
      PLAYWRIGHT: '1',
      INTERDOMESTIK_LOCAL_E2E: '1',
      INTERDOMESTIK_E2E_DIAGNOSTICS: '1',
      NEXT_PUBLIC_BILLING_TEST_MODE: '1',
      BILLING_TEST_MODE: '1',
    });

    expect(isProductionDeployment()).toBe(true);
    expect(isLocalE2ERuntime()).toBe(true);
    expect(isE2EDiagnosticsEnabled()).toBe(true);
    expect(isBillingTestActivationEnabled()).toBe(true);
  });

  it('never enables billing test activation in production deployment', () => {
    withEnv({
      NODE_ENV: 'production',
      NEXT_PUBLIC_BILLING_TEST_MODE: '1',
      BILLING_TEST_MODE: '1',
    });

    delete process.env.CI;
    delete process.env.PLAYWRIGHT;
    delete process.env.INTERDOMESTIK_AUTOMATED;

    expect(isBillingTestActivationEnabled()).toBe(false);
  });
});
