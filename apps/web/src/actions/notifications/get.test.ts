import { describe, expect, it } from 'vitest';

import { getNotificationsCore } from './get';

describe('actions/notifications getNotificationsCore', () => {
  it('throws when not authenticated', async () => {
    await expect(getNotificationsCore({ session: null, limit: 5 })).rejects.toThrow(
      'Not authenticated'
    );
  });
});
