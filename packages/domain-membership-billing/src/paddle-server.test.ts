import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  assertBillingEntityEnvConfigured,
  resolveBillingEntityConfig,
  resolveBillingEntityForTenantId,
} from './paddle-server';

const ORIGINAL_ENV = { ...process.env };

function clearBillingEnv(): void {
  delete process.env.PADDLE_API_KEY;
  delete process.env.PADDLE_WEBHOOK_SECRET_KEY;
  delete process.env.PADDLE_API_KEY_KS;
  delete process.env.PADDLE_API_KEY_MK;
  delete process.env.PADDLE_API_KEY_AL;
  delete process.env.PADDLE_WEBHOOK_SECRET_KEY_KS;
  delete process.env.PADDLE_WEBHOOK_SECRET_KEY_MK;
  delete process.env.PADDLE_WEBHOOK_SECRET_KEY_AL;
  delete process.env.NEXT_PUBLIC_PADDLE_ENV;
  delete process.env.VERCEL_ENV;
  delete process.env.NODE_ENV;
}

describe('paddle-server billing entity mapping', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    clearBillingEnv();
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('maps KS/MK/AL tenants to deterministic billing entities', () => {
    expect(resolveBillingEntityForTenantId('tenant_ks')).toBe('ks');
    expect(resolveBillingEntityForTenantId('tenant_mk')).toBe('mk');
    expect(resolveBillingEntityForTenantId('tenant_al')).toBe('al');
  });

  it('throws in production-like mode when required entity env config is missing', () => {
    process.env.NODE_ENV = 'production';
    process.env.PADDLE_API_KEY_MK = 'pdl_api_mk';
    process.env.PADDLE_WEBHOOK_SECRET_KEY_MK = 'whsec_mk';
    process.env.PADDLE_API_KEY_AL = 'pdl_api_al';
    process.env.PADDLE_WEBHOOK_SECRET_KEY_AL = 'whsec_al';

    expect(() => assertBillingEntityEnvConfigured()).toThrow(
      'Missing billing configuration for entity ks'
    );
  });

  it('uses explicit non-production fallback when entity-scoped env is not configured', () => {
    process.env.NODE_ENV = 'test';
    process.env.NEXT_PUBLIC_PADDLE_ENV = 'sandbox';
    process.env.PADDLE_API_KEY = 'pdl_api_shared';
    process.env.PADDLE_WEBHOOK_SECRET_KEY = 'whsec_shared';

    const config = resolveBillingEntityConfig('ks');
    expect(config.apiKey).toBe('pdl_api_shared');
    expect(config.webhookSecret).toBe('whsec_shared');
    expect(config.source).toBe('legacy-fallback');
  });
});
