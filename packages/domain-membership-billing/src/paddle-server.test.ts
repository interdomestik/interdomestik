import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PaddleClosedError } from './paddle-closed';
import {
  assertBillingEntityEnvConfigured,
  assertPublicBillingEntityAlignment,
  getPaddle,
  getPaddleAndConfigForEntity,
  getPaddleForEntity,
  getPublicBillingCheckoutConfig,
  resetPaddleClientCacheForTests,
  resolveBillingEntityConfig,
  resolveBillingEntityFromPathSegment,
  resolveBillingEntityForTenantId,
  resolveBillingTenantIdForEntity,
} from './paddle-server';

const { constructClient } = vi.hoisted(() => ({ constructClient: vi.fn() }));

vi.mock('@paddle/paddle-node-sdk', async importOriginal => ({
  ...(await importOriginal<typeof import('@paddle/paddle-node-sdk')>()),
  Paddle: constructClient,
}));

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
    constructClient.mockClear();
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

  it('allows duplicate self-serve public price ids for the KS pilot entity', () => {
    setEnv('VERCEL_ENV', 'production');
    setEnv('PADDLE_DEFAULT_BILLING_ENTITY', 'ks');
    setEnv('NEXT_PUBLIC_PADDLE_BILLING_ENTITY', 'ks');
    setEnv('NEXT_PUBLIC_PADDLE_ENV', 'sandbox');
    setEnv('NEXT_PUBLIC_PADDLE_CLIENT_TOKEN_KS', 'test_client_token_ks');
    setEnv('NEXT_PUBLIC_PADDLE_PRICE_STANDARD_YEAR_KS', 'pri_duplicate');
    setEnv('NEXT_PUBLIC_PADDLE_PRICE_FAMILY_YEAR_KS', 'pri_duplicate');

    expect(getPublicBillingCheckoutConfig()).toEqual(
      expect.objectContaining({
        priceIds: expect.objectContaining({
          standardYear: 'pri_duplicate',
          familyYear: 'pri_duplicate',
        }),
      })
    );
  });

  it('rejects duplicate self-serve public price ids for non-pilot entities', () => {
    setEnv('VERCEL_ENV', 'production');
    setEnv('PADDLE_DEFAULT_BILLING_ENTITY', 'mk');
    setEnv('NEXT_PUBLIC_PADDLE_BILLING_ENTITY', 'mk');
    setEnv('NEXT_PUBLIC_PADDLE_ENV', 'sandbox');
    setEnv('NEXT_PUBLIC_PADDLE_CLIENT_TOKEN_MK', 'test_client_token_mk');
    setEnv('NEXT_PUBLIC_PADDLE_PRICE_STANDARD_YEAR_MK', 'pri_duplicate');
    setEnv('NEXT_PUBLIC_PADDLE_PRICE_FAMILY_YEAR_MK', 'pri_duplicate');

    expect(() => getPublicBillingCheckoutConfig()).toThrow(
      'Public self-serve Paddle price ids must be distinct for the resolved billing entity.'
    );
  });

  it.each(['sandbox', 'production'])(
    'refuses every outbound client with %s configuration',
    mode => {
      setEnv('NEXT_PUBLIC_PADDLE_ENV', mode);
      setEnv('PADDLE_DEFAULT_BILLING_ENTITY', 'ks');
      setEnv('NEXT_PUBLIC_PADDLE_BILLING_ENTITY', 'ks');
      for (const suffix of ['', '_KS', '_MK', '_AL']) {
        setEnv(`PADDLE_API_KEY${suffix}`, 'paddle-api-key-fixture');
        setEnv(`PADDLE_WEBHOOK_SECRET_KEY${suffix}`, 'paddle-webhook-key-fixture');
        setEnv(`NEXT_PUBLIC_PADDLE_CLIENT_TOKEN${suffix}`, 'paddle-client-token-fixture');
        setEnv(`NEXT_PUBLIC_PADDLE_PRICE_STANDARD_YEAR${suffix}`, 'pri_standard');
        setEnv(`NEXT_PUBLIC_PADDLE_PRICE_FAMILY_YEAR${suffix}`, 'pri_family');
        setEnv(`NEXT_PUBLIC_PADDLE_PRICE_BUSINESS_YEAR${suffix}`, 'pri_business');
      }

      const clients = [
        () => getPaddle({ tenantId: 'tenant_mk' }),
        () => getPaddleForEntity('ks'),
        () => getPaddleAndConfigForEntity('al', { allowLegacyFallback: false }),
      ];
      for (const load of clients) {
        expect(load).toThrow(PaddleClosedError);
        expect(load).toThrow(expect.objectContaining({ code: 'PADDLE_CLOSED' }));
      }
      expect(constructClient).not.toHaveBeenCalled();
    }
  );

  it('refuses before requiring an entity or credentials', () => {
    setEnv('VERCEL_ENV', 'production');
    setEnv('NEXT_PUBLIC_PADDLE_ENV', 'invalid');

    expect(() => getPaddle()).toThrow(PaddleClosedError);
    expect(() => getPaddleForEntity('ks')).toThrow(PaddleClosedError);
    expect(() => getPaddleAndConfigForEntity('mk')).toThrow(PaddleClosedError);
    expect(constructClient).not.toHaveBeenCalled();
  });
});
