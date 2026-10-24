import { beforeEach, describe, expect, it, vi } from 'vitest';
const email = vi.hoisted(() => vi.fn().mockResolvedValue({ success: true }));
vi.mock('../email', () => ({ sendNewMessageEmail: email }));
import {
  deliverPublicReplyNotification,
  describePublicReplyFailure,
} from './public-reply-delivery';
import type { PublicReplyNotificationPlan } from './public-reply-notification';
const vapid = {
  subject: 'mailto:synthetic@example.test',
  publicKey: 'synthetic-public',
  privateKey: 'synthetic-private',
};
const plan = (
  overrides: Partial<PublicReplyNotificationPlan> = {}
): PublicReplyNotificationPlan => ({
  notificationId: 'notification-1',
  tenantId: 'tenant-a',
  actor: { id: 'staff-a', role: 'staff' },
  recipientId: 'member-a',
  verifiedEmail: 'member-a@example.test',
  claim: { id: 'claim-a', title: 'Synthetic case' },
  senderName: 'Synthetic Staff',
  messageContent: 'Public reply',
  pushSubscriptions: [
    { endpoint: 'https://push.example.test/own', p256dh: 'synthetic', auth: 'synthetic' },
  ],
  ...overrides,
});
beforeEach(() => vi.clearAllMocks());
describe('public reply delivery leaf with intercepted transports', () => {
  it('uses the verified recipient and canonical claim URL with per-call VAPID options', async () => {
    const sendPush = vi.fn().mockResolvedValue(undefined);
    await deliverPublicReplyNotification(plan(), { vapid, sendPush });
    expect(email).toHaveBeenCalledWith(
      'member-a@example.test',
      { id: 'claim-a', title: 'Synthetic case' },
      'Synthetic Staff',
      'Public reply'
    );
    expect(sendPush).toHaveBeenCalledTimes(1);
    expect(sendPush.mock.calls[0][0].endpoint).toBe('https://push.example.test/own');
    expect(JSON.parse(sendPush.mock.calls[0][1]).url).toBe('/member/claims/claim-a');
    expect(sendPush.mock.calls[0][2]).toEqual({ vapidDetails: vapid });
  });
  it('does not send email without verification or push without VAPID configuration', async () => {
    const sendPush = vi.fn();
    await deliverPublicReplyNotification(plan({ verifiedEmail: null }), { vapid: null, sendPush });
    expect(email).not.toHaveBeenCalled();
    expect(sendPush).not.toHaveBeenCalled();
  });
  it('does not push when the scoped preparation returned no permitted subscriptions', async () => {
    const sendPush = vi.fn();
    await deliverPublicReplyNotification(plan({ pushSubscriptions: [] }), { vapid, sendPush });
    expect(sendPush).not.toHaveBeenCalled();
  });
  it('reports only expired endpoints for scoped cleanup and preserves actor/tenant audit context', async () => {
    const sendPush = vi
      .fn()
      .mockRejectedValueOnce({ statusCode: 410 })
      .mockResolvedValueOnce(undefined);
    const removeExpiredSubscriptions = vi.fn().mockResolvedValue(undefined);
    const logAuditEvent = vi.fn().mockResolvedValue(undefined);
    await deliverPublicReplyNotification(
      plan({
        pushSubscriptions: [
          { endpoint: 'https://push.example.test/expired', p256dh: 'synthetic', auth: 'synthetic' },
          { endpoint: 'https://push.example.test/live', p256dh: 'synthetic', auth: 'synthetic' },
        ],
      }),
      { vapid, sendPush, removeExpiredSubscriptions, logAuditEvent }
    );
    expect(removeExpiredSubscriptions).toHaveBeenCalledWith(['https://push.example.test/expired']);
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-a',
        actorId: 'staff-a',
        actorRole: 'staff',
        entityId: 'member-a',
        metadata: expect.objectContaining({ okCount: 1, failCount: 1 }),
      })
    );
  });
});

it('classifies database failures without logging SQL, parameters or error messages', () => {
  const error = Object.assign(new Error('private recipient and SQL parameters'), {
    cause: { code: '42501', query: 'private SQL', params: ['private value'] },
  });
  expect(describePublicReplyFailure(error)).toEqual({ name: 'Error', code: '42501' });
  expect(JSON.stringify(describePublicReplyFailure(error))).not.toContain('private');
});

describe('public reply status getter boundary', () => {
  it('uses the second numeric read for expired cleanup rather than caching the first', async () => {
    let reads = 0;
    const error = {
      get statusCode() {
        reads += 1;
        return reads === 1 ? 503 : 404;
      },
    };
    const removeExpiredSubscriptions = vi.fn().mockResolvedValue(undefined);
    await deliverPublicReplyNotification(plan(), {
      vapid,
      sendPush: vi.fn().mockRejectedValue(error),
      removeExpiredSubscriptions,
    });
    expect(reads).toBe(2);
    expect(removeExpiredSubscriptions).toHaveBeenCalledWith(['https://push.example.test/own']);
  });

  it('keeps a second nonexpiry numeric read out of expired cleanup', async () => {
    let reads = 0;
    const error = {
      get statusCode() {
        reads += 1;
        return reads === 1 ? 404 : 503;
      },
    };
    const removeExpiredSubscriptions = vi.fn().mockResolvedValue(undefined);
    await deliverPublicReplyNotification(plan(), {
      vapid,
      sendPush: vi.fn().mockRejectedValue(error),
      removeExpiredSubscriptions,
    });
    expect(reads).toBe(2);
    expect(removeExpiredSubscriptions).not.toHaveBeenCalled();
  });

  it('rejects a numeric-string second read without coercing it into expired cleanup', async () => {
    let reads = 0;
    const error = {
      get statusCode() {
        reads += 1;
        return reads === 1 ? 503 : '404';
      },
    };
    const removeExpiredSubscriptions = vi.fn().mockResolvedValue(undefined);
    await deliverPublicReplyNotification(plan(), {
      vapid,
      sendPush: vi.fn().mockRejectedValue(error),
      removeExpiredSubscriptions,
    });
    expect(reads).toBe(2);
    expect(removeExpiredSubscriptions).not.toHaveBeenCalled();
  });

  it('does not coerce a nonnumber status object', async () => {
    let coercions = 0;
    const statusCode = {
      valueOf() {
        coercions += 1;
        return 404;
      },
    };
    const removeExpiredSubscriptions = vi.fn().mockResolvedValue(undefined);
    await deliverPublicReplyNotification(plan(), {
      vapid,
      sendPush: vi.fn().mockRejectedValue({ statusCode }),
      removeExpiredSubscriptions,
    });
    expect(coercions).toBe(0);
    expect(removeExpiredSubscriptions).not.toHaveBeenCalled();
  });

  it.each([1, 2])(
    'contains an exception from status read %s and keeps private text out of logs',
    async throwAt => {
      let reads = 0;
      const error = {
        get statusCode() {
          reads += 1;
          if (reads === throwAt) throw new Error('private status access payload');
          return 404;
        },
      };
      const removeExpiredSubscriptions = vi.fn().mockResolvedValue(undefined);
      const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      try {
        await expect(
          deliverPublicReplyNotification(plan(), {
            vapid,
            sendPush: vi.fn().mockRejectedValue(error),
            removeExpiredSubscriptions,
          })
        ).resolves.toBeUndefined();
        expect(reads).toBe(throwAt);
        expect(removeExpiredSubscriptions).not.toHaveBeenCalled();
        expect(errors).toHaveBeenCalledWith('Failed to send new message push:', { name: 'Error' });
        expect(JSON.stringify(errors.mock.calls)).not.toContain('private');
      } finally {
        errors.mockRestore();
      }
    }
  );
});
