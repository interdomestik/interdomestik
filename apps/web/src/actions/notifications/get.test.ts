import { describe, expect, it } from 'vitest';

import { getNotificationsCore } from './get';

describe('actions/notifications getNotificationsCore', () => {
  it('throws when not authenticated', async () => {
    await expect(
      getNotificationsCore({ session: null, authority: null, limit: 5, locale: 'en' })
    ).rejects.toThrow('Not authenticated');
  });
});
