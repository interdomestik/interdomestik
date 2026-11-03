import { afterAll, afterEach, beforeEach, expect, vi } from 'vitest';

const load = vi.hoisted(() => () => import('./public-reply-notification-flow.fixture'));
vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: async () => (await load()).state.session } },
}));
vi.mock('@/lib/rate-limit', () => ({ enforceRateLimit: () => Promise.resolve(null) }));
vi.mock('@/lib/audit', () => ({ logAuditEvent: () => Promise.resolve(undefined) }));
vi.mock('drizzle-orm', async original => ({
  ...(await original<typeof import('drizzle-orm')>()),
  ...(await load()).operators,
}));
vi.mock('@interdomestik/database', async () => {
  const f = await load();
  return { ...f.tables, db: f.db, withTenantContext: f.withTenantContext };
});
vi.mock('@interdomestik/database/schema', async () => (await load()).tables);
vi.mock('@/lib/push', async () => ({ sendPushToUser: (await load()).delivery('push') }));
vi.mock('../../../../../packages/domain-communications/src/push', async () => ({
  sendPushToUser: (await load()).delivery('domain-push'),
}));
vi.mock(
  '../../../../../packages/domain-communications/src/email',
  async () => (await load()).email
);

vi.mock('next/server', async () => {
  const f = await load();
  return {
    after: (work: () => Promise<void>) => {
      f.state.scheduled.push({
        commits: f.state.commits,
        notifications: f.state.rows.notifications.length,
      });
      f.state.jobs.push(work);
    },
  };
});
vi.mock(
  '../../../../../packages/domain-communications/src/messages/public-reply-delivery',
  async original => ({
    ...(await original<object>()),
    deliverPublicReplyNotification: async (
      plan: unknown,
      deps: {
        removeExpiredSubscriptions: (endpoints: string[]) => Promise<void>;
        logAuditEvent: unknown;
      }
    ) => {
      const f = await load();
      f.state.external.push({ kind: 'delivery', args: [plan] });
      f.state.auditLoggerPassed = deps.logAuditEvent;
      if (f.state.reportExpired) await deps.removeExpiredSubscriptions(f.state.reportExpired);
    },
  })
);

import { revalidatePath } from 'next/cache';
import { sendMessage } from '@/actions/messages';
import { ids, settle, state } from './public-reply-notification-flow.fixture';

export const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(revalidatePath).mockReset();
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      throw new Error('Unexpected network request');
    })
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});
afterAll(() => errors.mockRestore());
export async function reply(claimId = ids.claim, internal = false, clientMessageId?: string) {
  const delivered = state.external.length;
  const result = await sendMessage(claimId, 'Synthetic public reply', internal, clientMessageId);
  // Delivery runs only after the response, when the scheduled jobs settle.
  expect(state.external).toHaveLength(delivered);
  await settle();
  return result;
}
export function noNotification() {
  expect(state.rows.notifications).toEqual([]);
  expect(state.external).toEqual([]);
  expect(state.ambientReads).toEqual([]);
  expect(state.scheduled).toEqual([]);
}
