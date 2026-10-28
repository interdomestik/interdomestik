import { beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

vi.mock('@/lib/rate-limit', () => ({ enforceRateLimit: async () => null }));
vi.mock('@interdomestik/domain-communications/messages/mark-read', () => ({
  markMessagesAsReadCore: async () => ({ success: true }),
}));

import * as rateLimitModule from '@/lib/rate-limit';
import * as domainModule from '@interdomestik/domain-communications/messages/mark-read';
import { markMessagesAsReadCore } from './mark-read.core';

const mocks: { domain: MockInstance; rateLimit: MockInstance } = {
  domain: vi.spyOn(domainModule, 'markMessagesAsReadCore'),
  rateLimit: vi.spyOn(rateLimitModule, 'enforceRateLimit'),
};

const session = {
  user: { id: 'member-1', tenantId: 'tenant-1', role: 'member' },
} as Parameters<typeof markMessagesAsReadCore>[0]['session'];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rateLimit.mockResolvedValue(null);
  mocks.domain.mockResolvedValue({ success: true });
});

describe('mark-read validated input continuity', () => {
  it('forwards the validated ID snapshot when the original array changes during rate limiting', async () => {
    let finishRateLimit!: (value: null) => void;
    mocks.rateLimit.mockReturnValueOnce(
      new Promise(resolve => {
        finishRateLimit = resolve;
      })
    );
    const messageIds = ['message-1'];
    const requestHeaders = new Headers();
    const pending = markMessagesAsReadCore({ session, messageIds, requestHeaders });

    expect(mocks.rateLimit).toHaveBeenCalledTimes(1);
    expect(mocks.domain).not.toHaveBeenCalled();
    messageIds.splice(0, 1, 'unvalidated-later-id');
    finishRateLimit(null);

    await expect(pending).resolves.toEqual({ success: true });
    expect(mocks.domain).toHaveBeenCalledExactlyOnceWith({
      session,
      messageIds: ['message-1'],
      requestHeaders,
    });
    expect(mocks.domain.mock.calls[0][0].messageIds).not.toBe(messageIds);
  });

  it('rejects invalid IDs before rate limiting or the domain call', async () => {
    const result = await markMessagesAsReadCore({
      session,
      messageIds: [''],
      requestHeaders: new Headers(),
    });

    expect(result.success).toBe(false);
    expect(mocks.rateLimit).not.toHaveBeenCalled();
    expect(mocks.domain).not.toHaveBeenCalled();
  });

  it('preserves rate-limit denial without calling the domain', async () => {
    mocks.rateLimit.mockResolvedValueOnce({ limited: true });
    await expect(
      markMessagesAsReadCore({
        session,
        messageIds: ['message-1'],
        requestHeaders: new Headers(),
      })
    ).resolves.toEqual({ success: false, error: 'Too many requests' });
    expect(mocks.domain).not.toHaveBeenCalled();
  });
});
