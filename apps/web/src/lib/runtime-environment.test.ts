import { afterEach, describe, expect, it } from 'vitest';

import {
  isAutomatedRuntime,
  isBillingTestActivationEnabled,
  isE2EDiagnosticsEnabled,
  isLocalE2ERuntime,
  isProductionDeployment,
} from './runtime-environment';

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
