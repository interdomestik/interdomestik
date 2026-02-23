import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  assertBillingEntityEnvConfigured,
  resolveBillingEntityConfig,
  resolveBillingEntityForTenantId,
} from './paddle-server';

const ORIGINAL_ENV = { ...process.env };

function setEnv(name: string, value: string): void {
  (process.env as Record<string, string | undefined>)[name] = value;
}

function unsetEnv(name: string): void {
  delete (process.env as Record<string, string | undefined>)[name];
}

function clearBillingEnv(): void {
  unsetEnv('PADDLE_API_KEY');
  unsetEnv('PADDLE_WEBHOOK_SECRET_KEY');
  unsetEnv('PADDLE_API_KEY_KS');
  unsetEnv('PADDLE_API_KEY_MK');
  unsetEnv('PADDLE_API_KEY_AL');
  unsetEnv('PADDLE_WEBHOOK_SECRET_KEY_KS');
  unsetEnv('PADDLE_WEBHOOK_SECRET_KEY_MK');
  unsetEnv('PADDLE_WEBHOOK_SECRET_KEY_AL');
  unsetEnv('NEXT_PUBLIC_PADDLE_ENV');
  unsetEnv('VERCEL_ENV');
  unsetEnv('NODE_ENV');
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
    setEnv('NODE_ENV', 'production');
    setEnv('PADDLE_API_KEY_MK', 'pdl_api_mk');
    setEnv('PADDLE_WEBHOOK_SECRET_KEY_MK', 'whsec_mk');
    setEnv('PADDLE_API_KEY_AL', 'pdl_api_al');
    setEnv('PADDLE_WEBHOOK_SECRET_KEY_AL', 'whsec_al');

    expect(() => assertBillingEntityEnvConfigured()).toThrow(
      'Missing billing configuration for entity ks'
    );
  });

  it('uses explicit non-production fallback when entity-scoped env is not configured', () => {
    setEnv('NODE_ENV', 'test');
    setEnv('NEXT_PUBLIC_PADDLE_ENV', 'sandbox');
    setEnv('PADDLE_API_KEY', 'pdl_api_shared');
    setEnv('PADDLE_WEBHOOK_SECRET_KEY', 'whsec_shared');

    const config = resolveBillingEntityConfig('ks');
    expect(config.apiKey).toBe('pdl_api_shared');
    expect(config.webhookSecret).toBe('whsec_shared');
    expect(config.source).toBe('legacy-fallback');
  });
});
