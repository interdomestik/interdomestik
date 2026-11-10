import { describe, expect, it } from 'vitest';
import {
  authority,
  claim,
  deferred,
  deliver,
  externalCalls,
  mocks,
  subscription,
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
const notifiers = [
  ['message', notify],
  [
    'verification',
    () => notifyPaymentVerificationUpdate('recipient', '', verification, { authority }),
  ],
  [
    'documents',
    () => notifyDocumentRequested('recipient', '', claim, 'REQUEST-SENTINEL', { authority }),
  ],
] as const;

describe('recipient role changes between preparation and actual dispatch', () => {
  it.each(notifiers)(
    'rechecks %s after persistence and deferred email resolution',
    async (_label, send) => {
      const persisted = deferred<{ success: boolean }>();
      const persisting = deferred<void>();
      mocks.persist.mockImplementationOnce(() => {
        persisting.resolve();
        return persisted.promise;
      });
      mocks.role.mockResolvedValue('staff');
      const sending = send();
      await persisting.promise;
      expect(mocks.after).not.toHaveBeenCalled();
      mocks.role.mockResolvedValue('branch_manager');
      persisted.resolve({ success: true });
      await sending;
      const target = deferred<string>();
      const resolving = deferred<void>();
      mocks.emailTarget.mockImplementationOnce(() => {
        resolving.resolve();
        return target.promise;
      });
      const delivery = deliver();
      await resolving.promise;
      target.resolve('verified@example.test');
      await delivery;
      expect(externalCalls()).not.toContain('SENTINEL');
      const emails =
        mocks.messageEmail.mock.calls.length +
        mocks.verificationEmail.mock.calls.length +
        mocks.email.mock.calls.length;
      expect(emails).toBe(1);
      expect(mocks.role.mock.calls.length).toBeGreaterThanOrEqual(2);
    }
  );
  it.each(notifiers)(
    'rechecks %s when the recipient changes while the email address is resolving',
    async (_label, send) => {
      mocks.role.mockResolvedValue('staff');
      await send();
      const target = deferred<string>();
      const resolving = deferred<void>();
      mocks.emailTarget.mockImplementationOnce(() => {
        resolving.resolve();
        return target.promise;
      });
      const delivery = deliver();
      await resolving.promise;
      mocks.role.mockResolvedValue('branch_manager');
      target.resolve('verified@example.test');
      await delivery;
      const emails = JSON.stringify([
        ...mocks.messageEmail.mock.calls,
        ...mocks.verificationEmail.mock.calls,
        ...mocks.email.mock.calls,
      ]);
      expect(emails).not.toContain('SENTINEL');
      expect(emails).toContain('trusted:');
    }
  );
  it('rechecks message push after preference/subscription loading even when email has already dispatched', async () => {
    mocks.role.mockResolvedValue('staff');
    await notify();
    const subscriptions = deferred<(typeof subscription)[]>();
    const emailSent = deferred<void>();
    mocks.subscriptions.mockReturnValueOnce(subscriptions.promise);
    mocks.messageEmail.mockImplementationOnce(() => {
      emailSent.resolve();
      return Promise.resolve();
    });
    const delivery = deliver();
    await emailSent.promise;
    expect(mocks.messageEmail).toHaveBeenCalledWith(
      'verified@example.test',
      claim,
      'SENDER-SENTINEL',
      'MESSAGE-SENTINEL'
    );
    mocks.role.mockResolvedValue('branch_manager');
    subscriptions.resolve([subscription]);
    await delivery;
    expect(JSON.stringify(mocks.push.mock.calls)).not.toContain('SENTINEL');
    expect(mocks.push).toHaveBeenCalledWith(
      expect.anything(),
      [subscription],
      expect.objectContaining({ body: 'trusted:newMessage.content' })
    );
  });
  it('reads the dispatch role after asynchronous trusted-copy loading', async () => {
    await notify();
    const translations = deferred<(key: string) => string>();
    const resolving = deferred<void>();
    mocks.translations.mockImplementation(() => {
      resolving.resolve();
      return translations.promise;
    });
    const delivery = deliver();
    await resolving.promise;
    mocks.role.mockResolvedValue('branch_manager');
    translations.resolve(key => `trusted:${key}`);
    await delivery;
    expect(externalCalls()).not.toContain('SENTINEL');
  });
  it.each(['missing', 'failed', 'copy-failed'])(
    'fails closed on a %s dispatch-time role/copy result',
    async failure => {
      await notify();
      if (failure === 'missing') mocks.role.mockResolvedValue(null);
      if (failure === 'failed') mocks.role.mockRejectedValue(new Error('PRIVATE-SENTINEL'));
      if (failure === 'copy-failed') {
        mocks.role.mockResolvedValue('branch_manager');
        mocks.translations.mockRejectedValue(new Error('PRIVATE-SENTINEL'));
      }
      await deliver();
      expect(mocks.messageEmail).not.toHaveBeenCalled();
      expect(mocks.push).not.toHaveBeenCalled();
    }
  );
  it('does not use an unverified address or disabled/absent subscriptions', async () => {
    await notify();
    mocks.emailTarget.mockResolvedValue(null);
    mocks.subscriptions.mockResolvedValue([]);
    await deliver();
    expect(mocks.messageEmail).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
