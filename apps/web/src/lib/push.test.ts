import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('web-push', () => {
  const setVapidDetails = vi.fn();
  const sendNotification = vi.fn().mockResolvedValue(undefined);
  return {
    default: {
      setVapidDetails,
      sendNotification,
    },
  };
});

const hoistedMocks = vi.hoisted(() => ({
  dbSelect: vi.fn(),
  dbDelete: vi.fn(),
  dbUserFindFirst: vi.fn(),
}));

vi.mock('@interdomestik/database', () => ({
  db: {
    select: hoistedMocks.dbSelect,
    delete: hoistedMocks.dbDelete,
    query: {
      user: {
        findFirst: hoistedMocks.dbUserFindFirst,
      },
    },
  },
}));

vi.mock('@interdomestik/database/tenant-security', () => ({
  withTenant: vi.fn(() => ({ scoped: true })),
}));

vi.mock('@interdomestik/database/schema', () => ({
  pushSubscriptions: {
    userId: 'user_id',
    tenantId: 'tenant_id',
    endpoint: 'endpoint',
    p256dh: 'p256dh',
    auth: 'auth',
  },
  userNotificationPreferences: {
    userId: 'user_id',
    tenantId: 'tenant_id',
    pushClaimUpdates: 'push_claim_updates',
    pushMessages: 'push_messages',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
  and: vi.fn(),
}));

vi.mock('@/lib/audit', () => ({
  logAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

import webPush from 'web-push';
import { sendPushToUser } from './push';

type WhereResult<T> = Pick<Promise<T>, 'then' | 'catch' | 'finally'> & {
  limit: () => Promise<T>;
};

function makeWhereResult<T>(value: T): WhereResult<T> {
  const promise = Promise.resolve(value);
  return {
    limit: () => promise,
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
    finally: promise.finally.bind(promise),
  };
}

const webPushMock = webPush as unknown as {
  setVapidDetails: ReturnType<typeof vi.fn>;
  sendNotification: ReturnType<typeof vi.fn>;
};

describe('sendPushToUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoistedMocks.dbUserFindFirst.mockResolvedValue({ tenantId: 'tenant_mk' });
    vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'public');
    vi.stubEnv('VAPID_PRIVATE_KEY', 'private');
    vi.stubEnv('VAPID_SUBJECT', 'mailto:test@example.com');
  });

  it('skips when no subscriptions', async () => {
    const queue: unknown[] = [[{ pushClaimUpdates: true, pushMessages: true }], []];
    hoistedMocks.dbSelect.mockImplementation(() => ({
      from: () => ({
        where: () => makeWhereResult(queue.shift()),
      }),
    }));

    const result = await sendPushToUser('user-1', 'claim_updates', {
      title: 't',
      body: 'b',
      url: '/x',
    });

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        skipped: true,
        reason: 'no_subscription',
      })
    );
  });

  it('respects preferences disabled', async () => {
    const queue: unknown[] = [
      [{ pushMessages: false, pushClaimUpdates: true }],
      [{ endpoint: 'e', p256dh: 'p', auth: 'a' }],
    ];
    hoistedMocks.dbSelect.mockImplementation(() => ({
      from: () => ({
        where: () => makeWhereResult(queue.shift()),
      }),
    }));

    const result = await sendPushToUser('user-1', 'messages', {
      title: 't',
      body: 'b',
      url: '/x',
    });

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        skipped: true,
        reason: 'preferences_disabled',
      })
    );
    expect(webPushMock.sendNotification).not.toHaveBeenCalled();
  });

  it('sends to all subscriptions and returns counts', async () => {
    const queue: unknown[] = [
      [{ pushClaimUpdates: true, pushMessages: true }],
      [
        { endpoint: 'e1', p256dh: 'p1', auth: 'a1' },
        { endpoint: 'e2', p256dh: 'p2', auth: 'a2' },
      ],
    ];
    hoistedMocks.dbSelect.mockImplementation(() => ({
      from: () => ({
        where: () => makeWhereResult(queue.shift()),
      }),
    }));

    const result = await sendPushToUser('user-1', 'claim_updates', {
      title: 't',
      body: 'b',
      url: '/x',
    });

    expect(webPushMock.setVapidDetails).toHaveBeenCalled();
    expect(webPushMock.sendNotification).toHaveBeenCalledTimes(2);
    expect(result).toEqual(expect.objectContaining({ success: true, okCount: 2, failCount: 0 }));
  });

  it('deletes invalid subscriptions on 410', async () => {
    webPushMock.sendNotification.mockRejectedValueOnce({ statusCode: 410 });

    const queue: unknown[] = [
      [{ pushClaimUpdates: true, pushMessages: true }],
      [{ endpoint: 'e1', p256dh: 'p1', auth: 'a1' }],
    ];
    hoistedMocks.dbSelect.mockImplementation(() => ({
      from: () => ({
        where: () => makeWhereResult(queue.shift()),
      }),
    }));

    hoistedMocks.dbDelete.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });

    const result = await sendPushToUser('user-1', 'claim_updates', {
      title: 't',
      body: 'b',
      url: '/x',
    });

    expect(result).toEqual(expect.objectContaining({ success: false, okCount: 0, failCount: 1 }));
    expect(hoistedMocks.dbDelete).toHaveBeenCalled();
  });
});
