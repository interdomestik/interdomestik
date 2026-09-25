import { ApiError, type Paddle } from '@paddle/paddle-node-sdk';
import { describe, expect, it, vi } from 'vitest';

import { resolvePaddleCustomer } from './paddle-customer';

describe('resolvePaddleCustomer', () => {
  const customerId = 'ctm_01hrffh7gvp29kc7xahm8wddwa';

  it('returns the identity fields from the entity-configured client', async () => {
    const customer = { id: customerId, email: 'provider@example.com', status: 'active' };
    const get = vi.fn().mockResolvedValue(customer);

    await expect(
      resolvePaddleCustomer({ customers: { get } } as unknown as Paddle, customerId)
    ).resolves.toEqual({ kind: 'resolved', customer });
    expect(get).toHaveBeenCalledWith(customerId);
  });

  it('keeps auth errors permanent and transport failures retryable', async () => {
    const get = vi
      .fn()
      .mockRejectedValueOnce(
        new ApiError(
          {
            type: 'request_error',
            code: 'invalid_token',
            detail: 'Invalid token',
            documentation_url: 'https://developer.paddle.com/errors/shared/invalid_token',
          },
          null
        )
      )
      .mockRejectedValueOnce(new Error('network unavailable'));
    const paddle = { customers: { get } } as unknown as Paddle;

    await expect(resolvePaddleCustomer(paddle, customerId)).resolves.toEqual({
      kind: 'failed',
      retryable: false,
    });
    await expect(resolvePaddleCustomer(paddle, customerId)).resolves.toEqual({
      kind: 'failed',
      retryable: true,
    });
  });
});
