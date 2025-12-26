import { describe, expect, it } from 'vitest';

import type { Session } from './context';
import { getAdminAnalyticsCore } from './get-admin';

describe('actions/analytics getAdminAnalyticsCore', () => {
  it('returns Unauthorized for non-staff/admin users', async () => {
    const result = await getAdminAnalyticsCore({
      session: { user: { id: 'u1', role: 'user' } } as unknown as NonNullable<Session>,
    });

    expect(result).toEqual({ success: false, error: 'Unauthorized' });
  });
});
