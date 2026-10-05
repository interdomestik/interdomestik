import { beforeEach, vi } from 'vitest';
import { resetClaimActionMocks } from './claims.test-support';

vi.mock('@interdomestik/domain-membership-billing/subscription', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@interdomestik/domain-membership-billing/subscription')>();
  const { mockHasActiveMembership, mockGetActiveSubscription } =
    await import('./claims.test-support');
  return {
    ...actual,
    hasActiveMembership: () => mockHasActiveMembership(),
    getActiveSubscription: () => mockGetActiveSubscription(),
  };
});
vi.mock('@/lib/auth', async () => (await import('./claims.test-support')).authModuleMock());
vi.mock('@interdomestik/database/claim-number', async () =>
  (await import('./claims.test-support')).claimNumberModuleMock()
);
vi.mock('@interdomestik/database/tenant-directory', async () =>
  (await import('./claims.test-support')).tenantDirectoryModuleMock()
);
vi.mock('@interdomestik/database', async () =>
  (await import('./claims.test-support')).databaseModuleMock()
);
vi.mock('nanoid', async () => (await import('./claims.test-support')).nanoidModuleMock());
vi.mock('next/cache', async () => (await import('./claims.test-support')).nextCacheModuleMock());
vi.mock('next/headers', async () =>
  (await import('./claims.test-support')).nextHeadersModuleMock()
);
vi.mock('@/lib/notifications', async () =>
  (await import('./claims.test-support')).notificationsModuleMock()
);
vi.mock('@/lib/ai/claim-workflows', async () =>
  (await import('./claims.test-support')).aiClaimWorkflowsModuleMock()
);
vi.mock('@/lib/audit', async () => (await import('./claims.test-support')).auditModuleMock());
vi.mock('@/features/claims/upload/server/initial-claim-upload', async () =>
  (await import('./claims.test-support')).initialClaimUploadModuleMock()
);

beforeEach(() => {
  resetClaimActionMocks();
});
