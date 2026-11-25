import { acceptanceMocks, memberUser } from '@/lib/privacy/member-acceptance-denial.test-support';
import { createRecordingTenantTransaction } from '@/test/recording-tenant-transaction';
import { expect, it, vi } from 'vitest';

import { getNotifications } from '../notifications';

const { withTenantAuthority } = vi.hoisted(() => ({ withTenantAuthority: vi.fn() }));

vi.mock('@interdomestik/database/tenant-authority-context', () => ({ withTenantAuthority }));
vi.mock('@interdomestik/database/tenant-directory', () => ({
  readTenantLocaleMetadata: async () => null,
}));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('next-intl/server', () => ({
  getLocale: async () => 'en',
  getTranslations: async () => (key: string, values?: { claim: string }) => values?.claim ?? key,
}));
vi.mock('@sentry/nextjs', () => ({
  setTag: vi.fn(),
  withServerActionInstrumentation: (_name: string, _options: unknown, run: () => unknown) => run(),
}));

it('reads acceptance once before opening transactions for a legacy claim notification', async () => {
  const claim = {
    id: 'claim-1',
    userId: memberUser.id,
    title: 'Visible claim',
    status: 'submitted',
    documents: [],
    createdAt: new Date('2026-11-23'),
    updatedAt: null,
  };
  const notifications = createRecordingTenantTransaction([
    [
      {
        id: 'notification-1',
        type: 'claim_status_changed',
        content: `Update on: ${claim.id}`,
        actionUrl: `/member/claims/${claim.id}`,
        previewRestricted: false,
      },
    ],
  ]);
  const detail = createRecordingTenantTransaction([[{ title: claim.title }], [], []]);
  const transactions = [
    notifications.tx,
    { ...detail.tx, query: { claims: { findFirst: async () => claim } } },
  ];
  let transactionOpen = false;
  const acceptanceReads: boolean[] = [];
  withTenantAuthority.mockImplementation(async (_authority, read) => {
    expect(transactionOpen).toBe(false);
    const tx = transactions.shift();
    expect(tx).toBeDefined();
    transactionOpen = true;
    try {
      return await read(tx);
    } finally {
      transactionOpen = false;
    }
  });
  acceptanceMocks.readAcceptance.mockImplementation(async () => {
    acceptanceReads.push(transactionOpen);
    return { accepted: true, missing: [] };
  });

  await expect(getNotifications()).resolves.toMatchObject([{ content: claim.title }]);
  expect(withTenantAuthority).toHaveBeenCalledTimes(2);
  expect(acceptanceReads).toEqual([false]);
  expect(detail.executed).toEqual([
    {
      sql: 'select "title" from "claim" where ("claim"."tenant_id" = $1 and ("claim"."id" = $2 and "claim"."userId" = $3)) limit $4',
      params: [memberUser.tenantId, claim.id, memberUser.id, 1],
    },
  ]);
});
