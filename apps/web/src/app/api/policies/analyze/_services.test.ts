import { mocks } from './_services.test-support';
import { createHash } from 'node:crypto';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';

import { queuePolicyAnalysisService } from './_services';

mocks.nanoid
  .mockReturnValueOnce('policy-1')
  .mockReturnValueOnce('document-1')
  .mockReturnValueOnce('run-1')
  .mockReturnValueOnce('extraction-1');

const authority = mintTestTenantAuthority('tenant-1', { userId: 'user-1', role: 'member' });

describe('queuePolicyAnalysisService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.nanoid
      .mockReturnValueOnce('policy-1')
      .mockReturnValueOnce('document-1')
      .mockReturnValueOnce('run-1')
      .mockReturnValueOnce('extraction-1');
    mocks.txInsertValues.mockImplementation(() => ({
      onConflictDoNothing: mocks.txInsertOnConflictDoNothing,
      returning: mocks.txInsertReturning,
    }));
    mocks.txInsertReturning.mockResolvedValue([{ id: 'policy-1' }]);
    mocks.txInsertOnConflictDoNothing.mockResolvedValue(undefined);
    mocks.txUpdateReturning.mockResolvedValue([{ id: 'run-1' }]);
    mocks.txExecute.mockResolvedValue([{ id: 'document-1' }]);
  });

  it('persists a placeholder policy, document, and queued ai run in one transaction', async () => {
    const result = await queuePolicyAnalysisService({
      authority,
      userId: 'user-1',
      fileUrl: 'pii/tenants/tenant-1/policies/user-1/file.pdf',
      fileName: 'file.pdf',
      mimeType: 'application/pdf',
      fileSize: 2048,
    });

    expect(result).toEqual({ policyId: 'policy-1', runId: 'run-1' });
    expect(mocks.withTenantContext.mock.calls[0]?.[0]).toBe(authority);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.txInsert).toHaveBeenCalledTimes(3);

    expect(mocks.txInsert).toHaveBeenNthCalledWith(1, { __name: 'policies' });
    expect(mocks.txInsertValues).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        id: 'policy-1',
        tenantId: 'tenant-1',
        userId: 'user-1',
        provider: null,
        policyNumber: null,
        analysisJson: {},
        fileUrl: 'pii/tenants/tenant-1/policies/user-1/file.pdf',
      })
    );
    expect(mocks.txInsertReturning).toHaveBeenCalledOnce();

    expect(mocks.txInsert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ __name: 'documents' })
    );
    expect(mocks.txInsertValues).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        id: 'document-1',
        tenantId: 'tenant-1',
        entityType: 'policy',
        entityId: 'policy-1',
        fileName: 'file.pdf',
        mimeType: 'application/pdf',
        fileSize: 2048,
        storagePath: 'pii/tenants/tenant-1/policies/user-1/file.pdf',
        category: 'contract',
        uploadedBy: 'user-1',
        uploadedAt: expect.any(Date),
      })
    );

    expect(mocks.txInsert).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ __name: 'ai_runs' })
    );
    expect(mocks.txInsertValues).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        id: 'run-1',
        tenantId: 'tenant-1',
        workflow: 'policy_extract',
        status: 'queued',
        documentId: 'document-1',
        entityType: 'policy',
        entityId: 'policy-1',
        requestedBy: 'user-1',
        model: 'gpt-5.5',
        modelSnapshot: 'gpt-5.5',
        promptVersion: 'policy_extract_v1',
        requestJson: {
          fileName: 'file.pdf',
          fileSize: 2048,
          fileUrl: 'pii/tenants/tenant-1/policies/user-1/file.pdf',
          mimeType: 'application/pdf',
          promptCacheKey: 'interdomestik:policy_extract:gpt-5.5:policy_extract_v1',
        },
        reviewStatus: 'pending',
        createdAt: expect.any(Date),
      })
    );
    expect(
      (mocks.txInsertValues as unknown as { mock: { calls: unknown[][] } }).mock.calls[2]?.[0]
    ).toEqual(
      expect.objectContaining({
        // The hash keeps covering the tenant and uploader as it did before the authority change.
        inputHash: createHash('sha256')
          .update(
            JSON.stringify({
              tenantId: 'tenant-1',
              userId: 'user-1',
              fileUrl: 'pii/tenants/tenant-1/policies/user-1/file.pdf',
              fileName: 'file.pdf',
              mimeType: 'application/pdf',
              fileSize: 2048,
            })
          )
          .digest('hex'),
      })
    );
  });
});
