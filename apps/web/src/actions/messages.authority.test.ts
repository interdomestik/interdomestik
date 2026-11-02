import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  context: vi.fn(),
  get: vi.fn(),
  markRead: vi.fn(),
  send: vi.fn(),
}));

vi.mock('./messages/context', () => ({ getActionContext: mocks.context }));
vi.mock('./messages/get', () => ({ getMessagesForClaimCore: mocks.get }));
vi.mock('./messages/mark-read', () => ({ markMessagesAsReadCore: mocks.markRead }));
vi.mock('./messages/send', () => ({ sendMessageCore: mocks.send }));

import { getMessagesForClaim, markMessagesAsRead, sendMessage } from './messages.core';

const authority = mintTestTenantAuthority('tenant-1');
const session = { user: { id: 'user-1', role: 'user', tenantId: 'tenant-1' } };
const requestHeaders = new Headers();

describe('message actions derive the tenant authority from the request session', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.get.mockResolvedValue({ success: true, messages: [] });
    mocks.markRead.mockResolvedValue({ success: true });
    mocks.send.mockResolvedValue({ success: true });
  });

  it('hands the context authority itself to read, send and mark-read', async () => {
    mocks.context.mockResolvedValue({ session, authority, requestHeaders });

    await getMessagesForClaim('claim-1');
    await sendMessage('claim-1', 'Hello', false);
    await markMessagesAsRead(['message-1']);

    expect(mocks.get.mock.calls[0]![0].authority).toBe(authority);
    expect(mocks.send.mock.calls[0]![0].authority).toBe(authority);
    expect(mocks.markRead.mock.calls[0]![0].authority).toBe(authority);
    expect(mocks.get.mock.calls[0]![0].session).toBe(session);
  });

  it('passes no authority when the request has no session, so no data is accessed', async () => {
    mocks.context.mockResolvedValue({ session: null, authority: null, requestHeaders });

    await getMessagesForClaim('claim-1');
    await sendMessage('claim-1', 'Hello', false);
    await markMessagesAsRead(['message-1']);

    for (const core of [mocks.get, mocks.send, mocks.markRead]) {
      expect(core.mock.calls[0]![0].authority).toBeNull();
      expect(core.mock.calls[0]![0].session).toBeNull();
    }
  });
});
