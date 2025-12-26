import { describe, expect, it } from 'vitest';

import { updateClaimStatusCore } from './update-status';

describe('updateClaimStatusCore', () => {
  it('throws on invalid status before hitting the DB', async () => {
    const formData = new FormData();
    formData.set('claimId', 'claim-1');
    formData.set('status', 'not-a-real-status');
    formData.set('locale', 'en');

    await expect(
      updateClaimStatusCore({
        formData,
        session: {
          user: { id: 'admin-1', role: 'admin' },
          session: { id: 'session-1' },
        } as unknown as NonNullable<import('./context').Session>,
        requestHeaders: new Headers(),
      })
    ).rejects.toThrow('Invalid status');
  });
});
