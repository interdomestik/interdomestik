import { installCoreHooks } from './_core.hooks.test-support';
import { hoisted } from './_core.test-support';
import { runEntityCore, verifiedTransaction } from './_core.calls.test-support';
import { describe, expect, it } from 'vitest';

describe('handlePaddleWebhookEntityCore', () => {
  installCoreHooks();

  it('rejects webhook when resolved tenant maps to a different entity', async () => {
    hoisted.resolvePaddleUserOwner.mockResolvedValue({
      userId: 'user_owner',
      tenantId: 'tenant_mk',
    });

    const result = await runEntityCore('ks', 'sig_mk');

    expect(result.status).toBe(401);
    expect(result.body).toEqual({ error: 'Webhook entity mismatch' });
    expect(hoisted.handlePaddleWebhookCore).not.toHaveBeenCalled();
  });

  it('rejects webhook when payload metadata tenant disagrees with expected entity', async () => {
    hoisted.verifyPaddleWebhook.mockResolvedValue(
      verifiedTransaction('evt_mk', { tenantId: 'tenant_mk' })
    );
    hoisted.resolvePaddleUserOwner.mockResolvedValue(null);
    hoisted.dbSubscriptionFindFirst.mockResolvedValue(null);

    const result = await runEntityCore('ks', 'sig_mk');

    expect(result.status).toBe(401);
    expect(result.body).toEqual({ error: 'Webhook entity mismatch' });
    expect(hoisted.handlePaddleWebhookCore).not.toHaveBeenCalled();
  });

  it('rejects webhook when payload metadata entity disagrees with expected entity', async () => {
    hoisted.verifyPaddleWebhook.mockResolvedValue(verifiedTransaction('evt_mk', { entity: 'mk' }));

    const result = await runEntityCore('ks', 'sig_mk');

    expect(result.status).toBe(401);
    expect(result.body).toEqual({ error: 'Webhook entity mismatch' });
    expect(hoisted.resolvePaddleUserOwner).not.toHaveBeenCalled();
    expect(hoisted.resolvePaddleSubscriptionOwner).not.toHaveBeenCalled();
    expect(hoisted.dbSubscriptionFindFirst).not.toHaveBeenCalled();
    expect(hoisted.handlePaddleWebhookCore).not.toHaveBeenCalled();
  });

  it('delegates to shared core when tenant lookup throws during mismatch check', async () => {
    hoisted.resolvePaddleUserOwner.mockRejectedValue(new Error('db unavailable'));

    const result = await runEntityCore('ks', 'sig_ks');

    expect(result).toEqual({ status: 200, body: { success: true } });
    expect(hoisted.handlePaddleWebhookCore).toHaveBeenCalledTimes(1);
    expect(hoisted.handlePaddleWebhookCore).toHaveBeenCalledWith(
      expect.objectContaining({
        billingEntity: 'ks',
      })
    );
  });

  it('falls back to shared core handling when preflight signature verification fails', async () => {
    hoisted.verifyPaddleWebhook.mockRejectedValue(new Error('invalid signature'));
    hoisted.handlePaddleWebhookCore.mockResolvedValue({
      status: 401,
      body: { error: 'Invalid signature' },
    });

    const result = await runEntityCore('ks', 'sig_bad');

    expect(result).toEqual({ status: 401, body: { error: 'Invalid signature' } });
    expect(hoisted.handlePaddleWebhookCore).toHaveBeenCalledTimes(1);
    expect(hoisted.handlePaddleWebhookCore).toHaveBeenCalledWith(
      expect.objectContaining({
        billingEntity: 'ks',
      })
    );
  });
});
