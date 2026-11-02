import { installCoreHooks } from './_core.hooks.test-support';
import { hoisted } from './_core.test-support';
import { runEntityCore, verifiedTransaction } from './_core.calls.test-support';
import { describe, expect, it } from 'vitest';

describe('handlePaddleWebhookEntityCore', () => {
  installCoreHooks();

  it('delegates to shared core when resolved payload tenant matches expected entity', async () => {
    const result = await runEntityCore('ks', 'sig_ks');

    expect(result).toEqual({ status: 200, body: { success: true } });
    expect(hoisted.verifyPaddleWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        secret: 'whsec_ks',
        signature: 'sig_ks',
        // The preflight verification is bound to the entity route that received the delivery.
        billingEntity: 'ks',
      })
    );
    expect(hoisted.handlePaddleWebhookCore).toHaveBeenCalledTimes(1);
    expect(hoisted.handlePaddleWebhookCore).toHaveBeenCalledWith(
      expect.objectContaining({
        billingEntity: 'ks',
      })
    );
  });

  it('delegates to shared core when expected entity is mk and tenant resolves to tenant_mk', async () => {
    hoisted.verifyPaddleWebhook.mockResolvedValue(
      verifiedTransaction('evt_mk', { userId: 'user_mk' })
    );
    hoisted.resolvePaddleUserOwner.mockResolvedValue({
      userId: 'user_owner',
      tenantId: 'tenant_mk',
    });

    const result = await runEntityCore('mk', 'sig_mk');

    expect(result).toEqual({ status: 200, body: { success: true } });
    expect(hoisted.handlePaddleWebhookCore).toHaveBeenCalledTimes(1);
    expect(hoisted.handlePaddleWebhookCore).toHaveBeenCalledWith(
      expect.objectContaining({
        billingEntity: 'mk',
      })
    );
  });

  it('delegates to shared core when expected entity is al and explicit tenant metadata is tenant_al', async () => {
    hoisted.verifyPaddleWebhook.mockResolvedValue(
      verifiedTransaction('evt_al', { tenantId: 'tenant_al' })
    );

    const result = await runEntityCore('al', 'sig_al');

    expect(result).toEqual({ status: 200, body: { success: true } });
    expect(hoisted.handlePaddleWebhookCore).toHaveBeenCalledTimes(1);
    expect(hoisted.handlePaddleWebhookCore).toHaveBeenCalledWith(
      expect.objectContaining({
        billingEntity: 'al',
      })
    );
  });
});
