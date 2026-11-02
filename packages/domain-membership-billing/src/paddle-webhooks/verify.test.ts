import type { Paddle } from '@paddle/paddle-node-sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({ mintIngressCapability: vi.fn() }));

vi.mock('@interdomestik/database/ingress-registrar', () => ({
  mintIngressCapability: hoisted.mintIngressCapability,
}));

import { verifyPaddleWebhook } from './verify';

const DELIVERY = Object.freeze({ delivery: true });

function paddleWith(valid: boolean) {
  const isSignatureValid = vi.fn().mockResolvedValue(valid);
  return { paddle: { webhooks: { isSignatureValid } } as unknown as Paddle, isSignatureValid };
}

const base = {
  body: '{"event_type":"transaction.completed"}',
  signature: 'sig',
  parsedPayload: { event_type: 'transaction.completed', event_id: 'evt_1', data: { id: 'txn_1' } },
};

describe('verifyPaddleWebhook delivery binding', () => {
  const env = process.env as Record<string, string | undefined>;
  const saved = { ...env };

  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.mintIngressCapability.mockReturnValue(DELIVERY);
    env.PADDLE_API_KEY_KS = 'api_ks';
    env.PADDLE_WEBHOOK_SECRET_KEY_KS = 'whsec_ks';
    env.PADDLE_API_KEY_MK = 'api_mk';
    env.PADDLE_WEBHOOK_SECRET_KEY_MK = 'whsec_mk';
    env.PADDLE_WEBHOOK_SECRET_KEY = 'whsec_legacy';
    delete env.PADDLE_WEBHOOK_BYPASS_SIGNATURE_IN_DEV;
  });

  afterEach(() => {
    for (const key of Object.keys(env)) if (!(key in saved)) delete env[key];
    Object.assign(env, saved);
  });

  it('binds the delivery to the entity billing tenant after verifying with the entity secret', async () => {
    const { paddle, isSignatureValid } = paddleWith(true);

    const verified = await verifyPaddleWebhook({
      ...base,
      paddle,
      secret: 'whsec_mk',
      billingEntity: 'mk',
    });

    expect(isSignatureValid).toHaveBeenCalledWith(base.body, 'whsec_mk', 'sig');
    expect(hoisted.mintIngressCapability).toHaveBeenCalledWith(
      'paddle-delivery',
      expect.any(Number),
      { billingTenantId: 'tenant_mk' }
    );
    expect(verified.delivery).toBe(DELIVERY);
    expect(verified.signatureValid).toBe(true);
  });

  it('refuses a secret that is not the entity secret, including the legacy shared secret', async () => {
    const { paddle, isSignatureValid } = paddleWith(true);

    await expect(
      verifyPaddleWebhook({ ...base, paddle, secret: 'whsec_legacy', billingEntity: 'mk' })
    ).rejects.toThrow('does not belong to the billing entity');
    await expect(
      verifyPaddleWebhook({ ...base, paddle, secret: 'whsec_ks', billingEntity: 'mk' })
    ).rejects.toThrow('does not belong to the billing entity');

    expect(isSignatureValid).not.toHaveBeenCalled();
    expect(hoisted.mintIngressCapability).not.toHaveBeenCalled();
  });

  it('refuses an entity without its own configuration (no legacy fallback)', async () => {
    delete env.PADDLE_API_KEY_AL;
    delete env.PADDLE_WEBHOOK_SECRET_KEY_AL;
    env.PADDLE_API_KEY = 'api_legacy';
    const { paddle } = paddleWith(true);

    await expect(
      verifyPaddleWebhook({ ...base, paddle, secret: 'whsec_legacy', billingEntity: 'al' })
    ).rejects.toThrow();

    expect(hoisted.mintIngressCapability).not.toHaveBeenCalled();
  });

  it('mints nothing when the signature is invalid, even on an entity route', async () => {
    const { paddle } = paddleWith(false);

    await expect(
      verifyPaddleWebhook({ ...base, paddle, secret: 'whsec_mk', billingEntity: 'mk' })
    ).rejects.toThrow('signature verification failed');

    expect(hoisted.mintIngressCapability).not.toHaveBeenCalled();
  });

  it('leaves the delivery unbound without an entity (legacy shared-secret route)', async () => {
    const { paddle } = paddleWith(true);

    await verifyPaddleWebhook({ ...base, paddle, secret: 'whsec_legacy' });

    expect(hoisted.mintIngressCapability).toHaveBeenCalledWith(
      'paddle-delivery',
      expect.any(Number),
      { billingTenantId: undefined }
    );
  });

  it('binds the test-only bypass delivery to the entity tenant as well', async () => {
    env.PADDLE_WEBHOOK_BYPASS_SIGNATURE_IN_DEV = 'true';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { paddle, isSignatureValid } = paddleWith(false);

    const verified = await verifyPaddleWebhook({
      ...base,
      paddle,
      secret: 'unused',
      billingEntity: 'ks',
    });

    expect(verified.signatureBypassed).toBe(true);
    expect(isSignatureValid).not.toHaveBeenCalled();
    expect(hoisted.mintIngressCapability).toHaveBeenCalledWith(
      'paddle-delivery',
      expect.any(Number),
      { billingTenantId: 'tenant_ks' }
    );
    warn.mockRestore();
  });
});
