import { mocks, authorityFor } from './_services.test-support';
import { beforeEach, vi } from 'vitest';

export function installServicesHooks(): void {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizeInngestEventTenant.mockImplementation(
      async (_ingress: unknown, tenantId: string) => authorityFor(tenantId)
    );
    mocks.nanoid.mockReturnValueOnce('extraction-1');
    mocks.selectWhere.mockResolvedValue([
      {
        runId: 'run-1',
        tenantId: 'tenant-1',
        documentId: 'document-1',
        policyId: 'policy-1',
        storagePath: 'pii/tenants/tenant-1/policies/user-1/file.pdf',
        requestJson: {
          fileName: 'file.pdf',
          mimeType: 'application/pdf',
        },
        status: 'queued',
      },
    ]);
    mocks.updateReturning.mockResolvedValue([{ id: 'run-1' }]);
    mocks.txUpdateReturning.mockResolvedValue([{ id: 'run-1' }]);
    mocks.txExecute.mockResolvedValue([{ id: 'document-1' }]);
    mocks.txInsertValues.mockImplementation(() => ({
      onConflictDoNothing: mocks.txInsertOnConflictDoNothing,
      returning: mocks.txInsertReturning,
    }));
  });
}
