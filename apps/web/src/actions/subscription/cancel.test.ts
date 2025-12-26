import { describe, expect, it } from 'vitest';

import { cancelSubscriptionCore } from './cancel';

describe('actions/subscription cancelSubscriptionCore', () => {
  it('returns Unauthorized when session is missing', async () => {
    const result = await cancelSubscriptionCore({
      session: null,
      subscriptionId: 'sub_123',
    });

    expect(result).toEqual({ error: 'Unauthorized' });
  });
});
