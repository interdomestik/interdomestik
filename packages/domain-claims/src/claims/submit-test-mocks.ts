import { beforeEach, vi } from 'vitest';
import { resetSubmitClaimMocks } from './submit-test-support';

vi.mock('@interdomestik/database', async () =>
  (await import('./submit-test-support')).databaseModuleMock()
);
vi.mock('@interdomestik/database/tenant-security', async () =>
  (await import('./submit-test-support')).tenantSecurityModuleMock()
);
vi.mock('drizzle-orm', async () => (await import('./submit-test-support')).drizzleModuleMock());
vi.mock('@interdomestik/database/claim-number', async () => ({
  generateClaimNumber: (await import('./submit-test-support')).generateClaimNumberMock,
}));
vi.mock('@interdomestik/database/tenant-directory', async () => ({
  readTenantLocaleMetadata: (await import('./submit-test-support')).readTenantLocaleMetadataMock,
}));
vi.mock('@interdomestik/domain-membership-billing/subscription', async () => ({
  getActiveSubscription: (await import('./submit-test-support')).getActiveSubscriptionMock,
}));
vi.mock('@interdomestik/shared-auth', async () => ({
  ensureTenantId: (await import('./submit-test-support')).ensureTenantIdMock,
}));
vi.mock('nanoid', async () => ({ nanoid: (await import('./submit-test-support')).nanoidMock }));
vi.mock('./ai-workflows', async () => ({
  queueClaimDocumentAiWorkflows: (await import('./submit-test-support'))
    .queueClaimDocumentAiWorkflowsMock,
}));

beforeEach(() => {
  resetSubmitClaimMocks();
});
