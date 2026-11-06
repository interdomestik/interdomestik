import {
  authority,
  mocks,
  projectionFrom,
  resetSendMocks,
  staffSession,
} from './send.test-support';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { sendMessageDbCore } from './send';
import { keyedMessageId, MESSAGE_KEY_CONFLICT_ERROR } from './store-message';

describe('sendMessageDbCore authority', () => {
  beforeEach(resetSendMocks);

  it('rejects a send that holds no authority without opening a tenant transaction', async () => {
    const result = await sendMessageDbCore({
      session: staffSession,
      authority: null,
      requestHeaders: new Headers(),
      claimId: 'claim-1',
      content: 'Hello',
    });

    expect(result).toEqual({ success: false, error: 'Unauthorized' });
    expect(mocks.withTenantContext).not.toHaveBeenCalled();
  });

  it('writes under the supplied authority and audits with the same authority', async () => {
    const logAuditEvent = vi.fn();

    const result = await sendMessageDbCore({
      session: staffSession,
      authority,
      requestHeaders: new Headers(),
      claimId: 'claim-1',
      content: 'Hello',
      deps: { logAuditEvent },
    });

    expect(result).toMatchObject({
      success: true,
      claim: { id: 'claim-1', tenantId: 'tenant-1' },
    });
    expect(mocks.withTenantContext).toHaveBeenCalledTimes(1);
    expect(mocks.withTenantContext.mock.calls[0]?.[0]).toBe(authority);
    expect(logAuditEvent).toHaveBeenCalledTimes(1);
    expect(logAuditEvent.mock.calls[0]?.[0]).toMatchObject({ action: 'claim.message_sent' });
    expect(logAuditEvent.mock.calls[0]?.[0].authority).toBe(authority);
  });

  describe('with a client message key', () => {
    const clientMessageId = '7f1d2c3b-4a5e-4f60-8a71-92b3c4d5e6f7';
    const stored = { senderId: 'staff-1', claimId: 'claim-1', content: 'Hello', isInternal: false };
    const returning = vi.fn();
    const onConflictDoNothing = vi.fn(() => ({ returning }));
    const insertValues = vi.fn(() => ({ onConflictDoNothing }));
    const lookup = vi.fn();

    beforeEach(() => {
      mocks.tx.insert.mockReturnValue({ values: insertValues });
      // The replay lookup filters claim_messages directly; the projection joins the sender.
      mocks.tx.select.mockReturnValue({
        from: () => ({ ...projectionFrom(), where: () => ({ limit: lookup }) }),
      });
    });

    const keyedSend = (content: string, logAuditEvent = vi.fn()) =>
      sendMessageDbCore({
        session: staffSession,
        authority,
        requestHeaders: new Headers(),
        claimId: 'claim-1',
        content,
        clientMessageId,
        deps: { logAuditEvent },
      });

    it('derives the row id from tenant, sender and key', () => {
      const id = keyedMessageId('tenant-1', 'staff-1', clientMessageId);
      expect(id).toMatch(/^msg_[\w-]{43}$/);
      expect(keyedMessageId('tenant-1', 'staff-1', clientMessageId)).toBe(id);
      expect(keyedMessageId('tenant-1', 'member-1', clientMessageId)).not.toBe(id);
      expect(keyedMessageId('tenant-2', 'staff-1', clientMessageId)).not.toBe(id);
    });

    it('stores the first send once under its derived primary key', async () => {
      returning.mockResolvedValue([{ id: 'message-1' }]);
      const logAuditEvent = vi.fn();

      const result = await keyedSend('Hello', logAuditEvent);

      expect(result).toMatchObject({
        success: true,
        replayed: false,
        message: { id: 'message-1' },
      });
      expect(insertValues).toHaveBeenCalledWith(
        expect.objectContaining({
          id: keyedMessageId('tenant-1', 'staff-1', clientMessageId),
          tenantId: 'tenant-1',
          senderId: 'staff-1',
        })
      );
      expect(onConflictDoNothing).toHaveBeenCalledWith({ target: 'cm.id' });
      expect(lookup).not.toHaveBeenCalled();
      expect(logAuditEvent).toHaveBeenCalledTimes(1);
    });

    it('replays the stored message for a resent key without auditing it again', async () => {
      returning.mockResolvedValue([]);
      lookup.mockResolvedValue([stored]);
      const logAuditEvent = vi.fn();

      const result = await keyedSend('  Hello  ', logAuditEvent);

      expect(result).toMatchObject({ success: true, replayed: true, message: { id: 'message-1' } });
      expect(logAuditEvent).not.toHaveBeenCalled();
    });

    it.each([
      ['different content', [{ ...stored, content: 'Something else' }]],
      ['different audience', [{ ...stored, isInternal: true }]],
      ['an unreadable row', []],
    ])('fails closed when a resent key meets %s', async (_case, rows) => {
      returning.mockResolvedValue([]);
      lookup.mockResolvedValue(rows);
      const logAuditEvent = vi.fn();

      const result = await keyedSend('Hello', logAuditEvent);

      expect(result).toEqual({ success: false, error: MESSAGE_KEY_CONFLICT_ERROR });
      expect(logAuditEvent).not.toHaveBeenCalled();
    });

    it('rejects a malformed key before opening a tenant transaction', async () => {
      const result = await sendMessageDbCore({
        session: staffSession,
        authority,
        requestHeaders: new Headers(),
        claimId: 'claim-1',
        content: 'Hello',
        clientMessageId: 'bad key!',
      });

      expect(result).toEqual({ success: false, error: 'Invalid message key' });
      expect(mocks.withTenantContext).not.toHaveBeenCalled();
    });
  });
});
