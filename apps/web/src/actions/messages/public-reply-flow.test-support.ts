import { afterAll, afterEach, beforeEach, expect, vi } from 'vitest';

const load = vi.hoisted(() => () => import('./public-reply-notification-flow.fixture'));
vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: async () => (await load()).state.session } },
}));
vi.mock('@/lib/rate-limit', () => ({ enforceRateLimit: () => Promise.resolve(null) }));
vi.mock('@/lib/audit', () => ({ logAuditEvent: vi.fn(() => Promise.resolve(undefined)) }));
vi.mock('drizzle-orm', async original => ({
  ...(await original<typeof import('drizzle-orm')>()),
  ...(await load()).operators,
}));
vi.mock('@interdomestik/database', async () => {
  const f = await load();
  return {
    ...f.tables,
    db: f.db,
    and: f.operators.and,
    eq: f.operators.eq,
    sql: vi.fn(),
    withTenantContext: f.withTenantContext,
  };
});
vi.mock('@interdomestik/database/schema', async () => (await load()).tables);
vi.mock('@/lib/claim-notification-delivery-kick', () => ({
  kickClaimNotificationDeliveries: async (_authority: unknown, deliveryIds: string[]) => {
    const { state } = await load();
    state.scheduled.push({
      commits: state.commits,
      notifications: state.rows.notifications.length,
    });
    state.external.push({ kind: 'delivery', args: deliveryIds });
  },
}));
vi.mock('@interdomestik/domain-claims/staff-claims/scope', () => ({
  canStaffReadClaim: async (
    _tx: unknown,
    recipient: { userId: string; branchId?: string; claimId: string }
  ) => {
    const { state } = await load();
    const claim = state.rows.claims.find(c => c.id === recipient.claimId);
    if (claim?.caseLifecycleState !== 'submitted') return false;
    return recipient.branchId
      ? recipient.branchId === claim.branchId
      : claim.staffId == null || claim.staffId === recipient.userId;
  },
}));

import { revalidatePath } from 'next/cache';
import { sendMessage } from '@/actions/messages';
import { ids, state } from './public-reply-notification-flow.fixture';

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
  return sendMessage(claimId, 'Synthetic public reply', internal, clientMessageId);
}
export function noNotification() {
  expect(state.rows.notifications).toEqual([]);
  expect(state.external).toEqual([]);
  expect(state.ambientReads).toEqual([]);
  expect(state.scheduled).toEqual([]);
}
