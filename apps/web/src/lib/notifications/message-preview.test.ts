import { describe, expect, it } from 'vitest';
import {
  authority,
  claim,
  deliver,
  externalCalls,
  mocks,
  verification,
} from './preview.test-support';
import {
  notifyNewMessage,
  notifyPaymentVerificationUpdate,
  notifyDocumentRequested,
} from '../notifications.core';

const notify = () =>
  notifyNewMessage(
    'recipient',
    'untrusted@example.test',
    claim,
    'SENDER-SENTINEL',
    'MESSAGE-SENTINEL',
    { authority }
  );

describe('web notification wrapper email/push previews', () => {
  it('persists and delivers only trusted copy for BM, using a verified email destination', async () => {
    mocks.role.mockResolvedValue('branch_manager');
    expect(await notify()).toEqual({ success: true });
    expect(mocks.persist).toHaveBeenCalledWith(
      'recipient',
      'new_message',
      {
        claimId: 'claim',
        claimTitle: 'trusted:newMessage.title',
        senderName: 'trusted:newMessage.title',
        messagePreview: 'trusted:newMessage.content',
      },
      expect.objectContaining({ authority })
    );
    expect(mocks.messageEmail).not.toHaveBeenCalled();
    await deliver();
    expect(mocks.messageEmail).toHaveBeenCalledWith(
      'verified@example.test',
      {
        id: 'claim',
        title: 'trusted:newMessage.title',
      },
      'trusted:newMessage.title',
      'trusted:newMessage.content'
    );
    expect(mocks.push).toHaveBeenCalledWith(
      { authority, recipientId: 'recipient' },
      expect.any(Array),
      {
        title: 'trusted:newMessage.title',
        body: 'trusted:newMessage.content',
        url: '/dashboard/claims/claim',
      }
    );
    expect(externalCalls()).not.toContain('SENTINEL');
    expect(JSON.stringify(mocks.persist.mock.calls)).not.toContain('SENTINEL');
  });
  it.each([
    'tenant_admin',
    'admin',
    'super_admin',
    'staff',
    'member',
    'agent',
    'global_support',
    'auditor',
  ])('preserves %s full message, note and document-request content at delivery', async role => {
    mocks.role.mockResolvedValue(role);
    await notify();
    await deliver();
    expect(mocks.messageEmail).toHaveBeenCalledWith(
      'verified@example.test',
      claim,
      'SENDER-SENTINEL',
      'MESSAGE-SENTINEL'
    );
    expect(mocks.push).toHaveBeenCalledWith(
      { authority, recipientId: 'recipient' },
      expect.any(Array),
      {
        title: 'New Message',
        body: 'SENDER-SENTINEL: MESSAGE-SENTINEL',
        url: '/dashboard/claims/claim',
      }
    );
    await notifyPaymentVerificationUpdate('recipient', 'untrusted@example.test', verification, {
      authority,
    });
    await deliver();
    expect(mocks.verificationEmail).toHaveBeenCalledWith('verified@example.test', verification);
    await notifyDocumentRequested(
      'recipient',
      'untrusted@example.test',
      claim,
      'REQUEST-SENTINEL',
      { authority }
    );
    await deliver();
    expect(mocks.template).toHaveBeenCalledWith({
      title: 'Documents requested',
      intro: `Staff requested more documents for ${claim.title}.`,
      details: ['REQUEST-SENTINEL'],
      ctaLabel: 'Open claim',
      ctaUrl: 'https://example.test/member/claims/claim',
    });
  });
  it('redacts note-bearing email fields for BM', async () => {
    mocks.role.mockResolvedValue('branch_manager');
    await notifyPaymentVerificationUpdate('recipient', '', verification, { authority });
    await deliver();
    expect(mocks.verificationEmail).toHaveBeenCalledWith('verified@example.test', {
      ...verification,
      note: 'trusted:paymentVerificationUpdate.content',
    });
    await notifyDocumentRequested('recipient', '', claim, 'REQUEST-SENTINEL', { authority });
    await deliver();
    expect(mocks.template).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'trusted:documentRequested.title',
        intro: 'trusted:documentRequested.content',
        details: undefined,
      })
    );
    expect(externalCalls()).not.toContain('SENTINEL');
  });
  it('suppresses initial lookup failures and BM copy failures', async () => {
    mocks.role.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('PRIVATE-SENTINEL'));
    expect(await notify()).toEqual({ success: false });
    expect(await notify()).toEqual({ success: false });
    mocks.role.mockResolvedValue('branch_manager');
    mocks.translations.mockRejectedValue(new Error('PRIVATE-COPY-SENTINEL'));
    expect(await notify()).toEqual({ success: false });
    expect(mocks.persist).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
  });
  it('does not schedule external delivery for failed persistence', async () => {
    mocks.persist.mockResolvedValue({ success: false });
    expect(await notify()).toEqual({ success: false });
    expect(mocks.after).not.toHaveBeenCalled();
  });
});
