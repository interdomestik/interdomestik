import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  assertBillingEntityEnvConfigured,
  assertPublicBillingEntityAlignment,
  getPaddle,
  getPaddleForEntity,
  getPublicBillingCheckoutConfig,
  resetPaddleClientCacheForTests,
  resolveBillingEntityConfig,
  resolveBillingEntityFromPathSegment,
  resolveBillingEntityForTenantId,
  resolveBillingTenantIdForEntity,
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
  unsetEnv('PADDLE_DEFAULT_BILLING_ENTITY');
  unsetEnv('NEXT_PUBLIC_PADDLE_BILLING_ENTITY');
  unsetEnv('NEXT_PUBLIC_PADDLE_CLIENT_TOKEN');
  unsetEnv('NEXT_PUBLIC_PADDLE_CLIENT_TOKEN_KS');
  unsetEnv('NEXT_PUBLIC_PADDLE_CLIENT_TOKEN_MK');
  unsetEnv('NEXT_PUBLIC_PADDLE_CLIENT_TOKEN_AL');
  unsetEnv('NEXT_PUBLIC_PADDLE_PRICE_STANDARD_YEAR');
  unsetEnv('NEXT_PUBLIC_PADDLE_PRICE_STANDARD_YEAR_KS');
  unsetEnv('NEXT_PUBLIC_PADDLE_PRICE_STANDARD_YEAR_MK');
  unsetEnv('NEXT_PUBLIC_PADDLE_PRICE_STANDARD_YEAR_AL');
  unsetEnv('NEXT_PUBLIC_PADDLE_PRICE_FAMILY_YEAR');
  unsetEnv('NEXT_PUBLIC_PADDLE_PRICE_FAMILY_YEAR_KS');
  unsetEnv('NEXT_PUBLIC_PADDLE_PRICE_FAMILY_YEAR_MK');
  unsetEnv('NEXT_PUBLIC_PADDLE_PRICE_FAMILY_YEAR_AL');
  unsetEnv('NEXT_PUBLIC_PADDLE_PRICE_BUSINESS_YEAR');
  unsetEnv('NEXT_PUBLIC_PADDLE_PRICE_BUSINESS_YEAR_KS');
  unsetEnv('NEXT_PUBLIC_PADDLE_PRICE_BUSINESS_YEAR_MK');
  unsetEnv('NEXT_PUBLIC_PADDLE_PRICE_BUSINESS_YEAR_AL');
  unsetEnv('NEXT_PUBLIC_PADDLE_ENV');
  unsetEnv('VERCEL_ENV');
  unsetEnv('NODE_ENV');
}

describe('paddle-server billing entity mapping', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    clearBillingEnv();
    resetPaddleClientCacheForTests();
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('maps KS/MK/AL tenants to deterministic billing entities and rejects unknown tenants', () => {
    expect(resolveBillingEntityForTenantId('tenant_ks')).toBe('ks');
    expect(resolveBillingEntityForTenantId('tenant_mk')).toBe('mk');
    expect(resolveBillingEntityForTenantId('tenant_al')).toBe('al');
    expect(resolveBillingEntityForTenantId('tenant_unknown')).toBeNull();
    expect(resolveBillingEntityForTenantId(null)).toBeNull();
  });

  it('maps path segment and entity resolvers deterministically', () => {
    expect(resolveBillingEntityFromPathSegment('ks')).toBe('ks');
    expect(resolveBillingEntityFromPathSegment(' MK ')).toBe('mk');
    expect(resolveBillingEntityFromPathSegment('AL')).toBe('al');
    expect(resolveBillingEntityFromPathSegment('unknown')).toBeNull();
    expect(resolveBillingTenantIdForEntity('ks')).toBe('tenant_ks');
    expect(resolveBillingTenantIdForEntity('mk')).toBe('tenant_mk');
    expect(resolveBillingTenantIdForEntity('al')).toBe('tenant_al');
  });

  it('throws in production-like mode when required entity env config is missing with strict message', () => {
    setEnv('VERCEL_ENV', 'production');
    setEnv('PADDLE_API_KEY_MK', 'pdl_api_mk');
    setEnv('PADDLE_WEBHOOK_SECRET_KEY_MK', 'whsec_mk');
    setEnv('PADDLE_API_KEY_AL', 'pdl_api_al');
    setEnv('PADDLE_WEBHOOK_SECRET_KEY_AL', 'whsec_al');

    expect(() => assertBillingEntityEnvConfigured()).toThrowError(
      expect.objectContaining({
        message: expect.stringContaining('Missing billing configuration for entity ks'),
      })
    );

    try {
      assertBillingEntityEnvConfigured();
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain('production-like mode');
      expect(message).toContain('Legacy fallback is disabled in production-like mode.');
    }
  });

  it('prefers entity-scoped env when configured', () => {
    setEnv('PADDLE_API_KEY_KS', 'pdl_api_ks');
    setEnv('PADDLE_WEBHOOK_SECRET_KEY_KS', 'whsec_ks');

    const config = resolveBillingEntityConfig('ks');
    expect(config.source).toBe('entity');
    expect(config.apiKey).toBe('pdl_api_ks');
    expect(config.webhookSecret).toBe('whsec_ks');
    expect(config.apiKeyEnvVar).toBe('PADDLE_API_KEY_KS');
    expect(config.webhookSecretEnvVar).toBe('PADDLE_WEBHOOK_SECRET_KEY_KS');
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
    expect(config.apiKeyEnvVar).toBe('PADDLE_API_KEY');
    expect(config.webhookSecretEnvVar).toBe('PADDLE_WEBHOOK_SECRET_KEY');
  });

  it('resolves public checkout config from the same default billing entity in production-like mode', () => {
    setEnv('VERCEL_ENV', 'production');
    setEnv('PADDLE_DEFAULT_BILLING_ENTITY', 'ks');
    setEnv('NEXT_PUBLIC_PADDLE_BILLING_ENTITY', 'ks');
    setEnv('NEXT_PUBLIC_PADDLE_ENV', 'sandbox');
    setEnv('NEXT_PUBLIC_PADDLE_CLIENT_TOKEN_KS', 'test_client_token_ks');
    setEnv('NEXT_PUBLIC_PADDLE_PRICE_STANDARD_YEAR_KS', 'pri_standard_ks');
    setEnv('NEXT_PUBLIC_PADDLE_PRICE_FAMILY_YEAR_KS', 'pri_family_ks');

    const config = getPublicBillingCheckoutConfig();

    expect(config).toEqual(
      expect.objectContaining({
        entity: 'ks',
        tenantId: 'tenant_ks',
        environment: 'sandbox',
        clientToken: 'test_client_token_ks',
        priceIds: expect.objectContaining({
          standardYear: 'pri_standard_ks',
          familyYear: 'pri_family_ks',
        }),
      })
    );
  });

  it('rejects public checkout config when the public entity drifts from the server default entity', () => {
    setEnv('VERCEL_ENV', 'production');
    setEnv('PADDLE_DEFAULT_BILLING_ENTITY', 'ks');
    setEnv('NEXT_PUBLIC_PADDLE_BILLING_ENTITY', 'mk');

    expect(() => assertPublicBillingEntityAlignment()).toThrow(
      'Public Paddle billing entity must match PADDLE_DEFAULT_BILLING_ENTITY in production-like mode.'
    );
  });

  it('rejects duplicate self-serve public price ids in production-like mode', () => {
    setEnv('VERCEL_ENV', 'production');
    setEnv('PADDLE_DEFAULT_BILLING_ENTITY', 'ks');
    setEnv('NEXT_PUBLIC_PADDLE_BILLING_ENTITY', 'ks');
    setEnv('NEXT_PUBLIC_PADDLE_ENV', 'sandbox');
    setEnv('NEXT_PUBLIC_PADDLE_CLIENT_TOKEN_KS', 'test_client_token_ks');
    setEnv('NEXT_PUBLIC_PADDLE_PRICE_STANDARD_YEAR_KS', 'pri_duplicate');
    setEnv('NEXT_PUBLIC_PADDLE_PRICE_FAMILY_YEAR_KS', 'pri_duplicate');

    expect(() => getPublicBillingCheckoutConfig()).toThrow(
      'Public self-serve Paddle price ids must be distinct for the resolved billing entity.'
    );
  });

  it('reuses cached paddle client until credentials change', () => {
    setEnv('NODE_ENV', 'test');
    setEnv('NEXT_PUBLIC_PADDLE_ENV', 'sandbox');
    setEnv('PADDLE_API_KEY_KS', 'pdl_api_ks_1');
    setEnv('PADDLE_WEBHOOK_SECRET_KEY_KS', 'whsec_ks_1');

    const first = getPaddleForEntity('ks');
    const second = getPaddleForEntity('ks');
    expect(second).toBe(first);

    setEnv('PADDLE_API_KEY_KS', 'pdl_api_ks_2');
    const third = getPaddleForEntity('ks');
    expect(third).not.toBe(first);
  });

  it('getPaddle resolves entity from tenant context in production-like mode without legacy key', () => {
    setEnv('NEXT_PUBLIC_PADDLE_ENV', 'production');
    setEnv('PADDLE_API_KEY_KS', 'pdl_api_ks');
    setEnv('PADDLE_WEBHOOK_SECRET_KEY_KS', 'whsec_ks');
    setEnv('PADDLE_API_KEY_MK', 'pdl_api_mk');
    setEnv('PADDLE_WEBHOOK_SECRET_KEY_MK', 'whsec_mk');
    setEnv('PADDLE_API_KEY_AL', 'pdl_api_al');
    setEnv('PADDLE_WEBHOOK_SECRET_KEY_AL', 'whsec_al');

    expect(() => getPaddle({ tenantId: 'tenant_mk' })).not.toThrow();
  });

  it('getPaddle fails closed in production-like mode without resolvable entity context', () => {
    setEnv('NEXT_PUBLIC_PADDLE_ENV', 'production');
    setEnv('PADDLE_API_KEY_KS', 'pdl_api_ks');
    setEnv('PADDLE_WEBHOOK_SECRET_KEY_KS', 'whsec_ks');
    setEnv('PADDLE_API_KEY_MK', 'pdl_api_mk');
    setEnv('PADDLE_WEBHOOK_SECRET_KEY_MK', 'whsec_mk');
    setEnv('PADDLE_API_KEY_AL', 'pdl_api_al');
    setEnv('PADDLE_WEBHOOK_SECRET_KEY_AL', 'whsec_al');

    expect(() => getPaddle()).toThrow(
      'Unable to resolve billing entity. Provide tenant/entity context or set PADDLE_DEFAULT_BILLING_ENTITY.'
    );
  });

  it('throws clear error for invalid NEXT_PUBLIC_PADDLE_ENV values', () => {
    setEnv('PADDLE_API_KEY_KS', 'pdl_api_ks');
    setEnv('PADDLE_WEBHOOK_SECRET_KEY_KS', 'whsec_ks');
    setEnv('NEXT_PUBLIC_PADDLE_ENV', 'staging');

    expect(() => getPaddleForEntity('ks')).toThrow(
      'NEXT_PUBLIC_PADDLE_ENV must be "sandbox" or "production"'
    );
  });
});
