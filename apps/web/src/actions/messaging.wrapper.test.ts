import { describe, expect, it, vi } from 'vitest';

import { getClaimMessages, sendMessage } from './messaging';

vi.mock('./messages/context', () => ({
  getActionContext: vi.fn(async () => ({
    requestHeaders: new Headers(),
    session: { user: { id: 'user-1', role: 'user' } },
  })),
}));

vi.mock('./messages/get', () => ({
  getMessagesForClaimCore: vi.fn(async () => ({ success: true, messages: [] })),
}));

vi.mock('./messages/send', () => ({
  sendMessageCore: vi.fn(async () => ({ success: true, message: undefined })),
}));

describe('messaging action wrapper', () => {
  it('delegates getClaimMessages to core', async () => {
    const { getActionContext } = await import('./messages/context');
    const { getMessagesForClaimCore } = await import('./messages/get');

    const result = await getClaimMessages('claim-1');

    expect(getActionContext).toHaveBeenCalledTimes(1);
    expect(getMessagesForClaimCore).toHaveBeenCalledWith({
      claimId: 'claim-1',
      session: { user: { id: 'user-1', role: 'user' } },
    });
    expect(result).toEqual({ success: true, data: [] });
  });

  it('delegates sendMessage to core', async () => {
    const { getActionContext } = await import('./messages/context');
    const { sendMessageCore } = await import('./messages/send');

    const result = await sendMessage('claim-1', 'Hello', true);

    expect(getActionContext).toHaveBeenCalledTimes(1);
    expect(sendMessageCore).toHaveBeenCalledWith({
      claimId: 'claim-1',
      content: 'Hello',
      isInternal: true,
      session: { user: { id: 'user-1', role: 'user' } },
      requestHeaders: expect.any(Headers),
    });
    expect(result).toEqual({ success: true });
  });
});
