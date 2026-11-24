import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { claimLifecycleFieldsForStatus } from '@interdomestik/database/claim-lifecycle';
import {
  auditLog,
  claimDocuments,
  claimMessages,
  claimResponseRequests,
  claimStageHistory,
  claims,
  domainEventDeliveries,
  domainEvents,
  freeStartDrafts,
  notificationDeliveries,
  notifications,
} from '@interdomestik/database';
import {
  cleanupJourney,
  expectJourneyClean,
} from '../../e2e/gate/member-staff-evidence-journey-cleanup.fixture';
import { cleanupS5, teardown } from '../../e2e/gate/s5-saved-draft.fixture';

const { db, dbAdmin } = vi.hoisted(() => ({
  db: {
    query: {
      auditLog: { findMany: vi.fn() },
      claims: { findMany: vi.fn() },
      claimStageHistory: { findMany: vi.fn() },
      domainEvents: { findMany: vi.fn() },
      freeStartDrafts: { findMany: vi.fn() },
      notifications: { findMany: vi.fn() },
    },
  },
  dbAdmin: { transaction: vi.fn() },
}));

vi.mock('@interdomestik/database', async importOriginal => ({
  ...(await importOriginal<typeof import('@interdomestik/database')>()),
  db,
  dbAdmin,
}));
vi.mock('../../e2e/fixtures/auth.fixture', async () => ({
  expect: (await import('@playwright/test')).expect,
}));

const claimId = 'discovered-claim';
const journey = { counterparty: 'Test operator', summary: 'Test-only journey' };

function simulateClaimCleanup(notificationCount: number) {
  const submitted = { actionUrl: `/member/claims/${claimId}`, type: 'claim_submitted' };
  const findNotifications = vi.fn(() =>
    Promise.resolve(Array.from({ length: notificationCount }, () => submitted))
  );
  const lock = vi.fn(() =>
    Promise.resolve([{ id: claimId, ...claimLifecycleFieldsForStatus('submitted') }])
  );
  const remove = vi.fn((_table: unknown) => ({ where: vi.fn().mockResolvedValue(undefined) }));
  const tx = {
    execute: vi.fn().mockResolvedValue(undefined),
    query: {
      claims: { findMany: vi.fn().mockResolvedValue([{ id: claimId }]) },
      domainEvents: { findMany: vi.fn().mockResolvedValue([{ id: 'journey-event' }]) },
      notifications: { findMany: findNotifications },
    },
    select: () => ({ from: () => ({ where: () => ({ for: lock }) }) }),
    delete: remove,
  };
  const commit = vi.fn();
  dbAdmin.transaction.mockImplementation(
    async (run: (transaction: typeof tx) => Promise<unknown>) => {
      const result = await run(tx);
      commit();
      return result;
    }
  );
  return { commit, findNotifications, lock, remove };
}

beforeEach(() => {
  vi.resetAllMocks();
  Object.values(db.query).forEach(({ findMany }) => findMany.mockResolvedValue([]));
});
afterEach(() => vi.useRealTimers());

it.each([0, 2])(
  'commits cleanup and checks residue with %i submitted notifications',
  async count => {
    vi.useFakeTimers({ toFake: ['performance', 'setTimeout', 'clearTimeout'] });
    const { commit, findNotifications, lock, remove } = simulateClaimCleanup(count);
    const cleanedIds = new Set<string>();

    const result = teardown([
      () => cleanupJourney(null, journey, cleanedIds),
      () => expectJourneyClean(null, journey, cleanedIds),
    ]).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(15_000);

    expect(await result).toMatchObject({
      errors: [
        expect.objectContaining({
          message: expect.stringContaining('Drain committed journey notifications'),
        }),
      ],
    });
    expect(lock).toHaveBeenCalledBefore(findNotifications);
    expect(findNotifications).toHaveBeenCalledBefore(remove);
    expect(remove.mock.calls.flat()).toEqual([
      domainEventDeliveries,
      domainEvents,
      auditLog,
      notifications,
      notificationDeliveries,
      claimResponseRequests,
      claimStageHistory,
      claimDocuments,
      claimMessages,
      claims,
      freeStartDrafts,
    ]);
    expect(remove).toHaveBeenCalledBefore(commit);
    expect(commit).toHaveBeenCalledExactlyOnceWith();
    expect(commit).toHaveBeenCalledBefore(db.query.notifications.findMany);
  }
);

it('checks child rows for a claim S5 discovered and deleted before its ID was assigned', async () => {
  const { commit } = simulateClaimCleanup(1);
  const cleanedIds = new Set<string>();
  db.query.notifications.findMany.mockResolvedValue([{ id: 'leftover-notification' }]);

  await cleanupS5(null, journey, cleanedIds);

  expect(commit).toHaveBeenCalledExactlyOnceWith();
  await expect(expectJourneyClean(null, journey, cleanedIds)).rejects.toThrow(
    'leftover-notification'
  );
  expect(db.query.domainEvents.findMany).toHaveBeenCalledTimes(1);
  expect(db.query.claimStageHistory.findMany).toHaveBeenCalledTimes(1);
  expect(db.query.auditLog.findMany).toHaveBeenCalledTimes(1);
});
