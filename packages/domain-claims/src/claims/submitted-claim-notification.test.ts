import { describe, expect, it, vi } from 'vitest';
import { notifyClaimSubmitted } from './submitted-claim-notification';
import type { ClaimsSession } from './types';

describe('submitted claim notification dispatch', () => {
  it('passes the resolved tenant immediately without awaiting delivery', async () => {
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const send = vi.fn(() => pending);
    const session = { user: { id: 'member-a', email: 'member@example.test' } } as ClaimsSession;
    const result = notifyClaimSubmitted({
      deps: { notifyClaimSubmitted: send },
      session,
      claimId: 'claim-a',
      tenantId: 'tenant-a',
      data: { title: 'Claim title', category: 'vehicle' } as Parameters<
        typeof notifyClaimSubmitted
      >[0]['data'],
    });
    expect(result).toBeUndefined();
    expect(send).toHaveBeenCalledExactlyOnceWith(
      'member-a',
      'member@example.test',
      { id: 'claim-a', title: 'Claim title', category: 'vehicle' },
      { tenantId: 'tenant-a' }
    );
    finish();
    await pending;
  });
});
