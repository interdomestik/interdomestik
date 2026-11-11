import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  user: vi.fn(),
  select: vi.fn(),
  where: vi.fn(),
  delete: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@interdomestik/database/tenant-authority-context', () => ({
  withTenantAuthority: mocks.transaction,
}));
import {
  loadPreviewEmail,
  loadPreviewSubscriptions,
  removePreviewSubscriptions,
} from './delivery-targets';

const authority = mintTestTenantAuthority('tenant-a');
const recipient = { authority, recipientId: 'recipient' };
const subscription = { endpoint: 'https://push.example.test/own', auth: 'auth', p256dh: 'key' };
const sqlParams = (where: SQL) => new PgDialect().sqlToQuery(where).params;
beforeEach(() => {
  vi.resetAllMocks();
  mocks.transaction.mockImplementation((_authority, run) =>
    Promise.resolve().then(() =>
      run({
        query: { user: { findFirst: mocks.user } },
        select: mocks.select,
        delete: mocks.delete,
      })
    )
  );
  mocks.user.mockResolvedValue({ email: 'verified@example.test', emailVerified: true });
  mocks.select.mockReturnValue({ from: () => ({ where: mocks.where }) });
  mocks.where
    .mockReturnValueOnce({ limit: () => Promise.resolve([{ messages: true }]) })
    .mockResolvedValueOnce([subscription]);
  mocks.delete.mockReturnValue({ where: mocks.where });
});
describe('tenant-bound notification destinations', () => {
  it('uses only a verified email from the authority tenant and exact recipient', async () => {
    expect(await loadPreviewEmail(recipient)).toBe('verified@example.test');
    expect(mocks.transaction).toHaveBeenCalledWith(authority, expect.any(Function));
    expect(sqlParams(mocks.user.mock.calls[0][0].where)).toEqual(['tenant-a', 'recipient']);
    mocks.user.mockResolvedValueOnce({ email: 'unverified@example.test', emailVerified: false });
    expect(await loadPreviewEmail(recipient)).toBeNull();
    mocks.user.mockResolvedValueOnce(undefined);
    expect(await loadPreviewEmail(recipient)).toBeNull();
  });
  it('loads message preferences and subscriptions with exact tenant/user predicates', async () => {
    expect(await loadPreviewSubscriptions(recipient)).toEqual([subscription]);
    for (const [where] of mocks.where.mock.calls)
      expect(sqlParams(where)).toEqual(['tenant-a', 'recipient']);
  });
  it('does not load subscriptions when message push is disabled', async () => {
    mocks.where
      .mockReset()
      .mockReturnValue({ limit: () => Promise.resolve([{ messages: false }]) });
    expect(await loadPreviewSubscriptions(recipient)).toEqual([]);
    expect(mocks.select).toHaveBeenCalledTimes(1);
  });
  it('refuses every destination and cleanup operation for a mismatched access tenant', async () => {
    const mismatched = {
      ...recipient,
      authority: mintTestTenantAuthority('tenant-a', { accessTenantId: 'tenant-b' }),
    };
    expect(await loadPreviewEmail(mismatched)).toBeNull();
    expect(await loadPreviewSubscriptions(mismatched)).toEqual([]);
    await removePreviewSubscriptions(mismatched, [subscription], [subscription.endpoint]);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it('cleans only planned expired endpoints, in the same recipient tenant', async () => {
    mocks.where.mockReset().mockResolvedValue(undefined);
    await removePreviewSubscriptions(
      recipient,
      [subscription],
      [subscription.endpoint, 'https://push.example.test/foreign']
    );
    expect(sqlParams(mocks.where.mock.calls[0][0])).toEqual([
      'tenant-a',
      'recipient',
      subscription.endpoint,
    ]);
    mocks.transaction.mockClear();
    await removePreviewSubscriptions(
      recipient,
      [subscription],
      ['https://push.example.test/foreign']
    );
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
