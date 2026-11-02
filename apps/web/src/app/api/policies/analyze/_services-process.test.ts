import { installServicesHooks } from './_services.hooks.test-support';
import { mocks, authorityFor, ingress } from './_services.test-support';
import { describe, expect, it, vi } from 'vitest';

import { processPolicyAnalysisRunService } from './_services';

describe('processPolicyAnalysisRunService', () => {
  installServicesHooks();

  it('completes a queued run and persists the extraction in the background path', async () => {
    const analysis = {
      provider: 'Acme Insurance',
      policyNumber: 'POL-123',
      coverageAmount: 100000,
      currency: 'EUR',
      deductible: 500,
      confidence: 0.83,
      warnings: ['Confirm deductible.'],
      hiddenPerks: [],
      summary: 'Extracted in background.',
    };

    const result = await processPolicyAnalysisRunService({
      runId: 'run-1',
      ingress,
      tenantId: 'tenant-1',
      deps: {
        downloadFile: vi.fn().mockResolvedValue(Buffer.from('pdf-bytes')),
        analyzeImage: vi.fn(),
        analyzePdf: vi
          .fn()
          .mockResolvedValue(
            'Valid text content from PDF that is definitely longer than fifty characters.'
          ),
        analyzeText: vi.fn().mockResolvedValue(analysis),
      },
    });

    expect(result).toEqual({
      status: 'completed',
      runId: 'run-1',
      policyId: 'policy-1',
      analysis,
    });
    expect(mocks.authorizeInngestEventTenant).toHaveBeenCalledWith(ingress, 'tenant-1');
    expect(mocks.withTenantContext).toHaveBeenCalled();
    for (const call of mocks.withTenantContext.mock.calls) {
      expect(call[0]).toBe(authorityFor('tenant-1'));
    }
    expect(mocks.txUpdate).toHaveBeenCalledWith(expect.objectContaining({ __name: 'ai_runs' }));
    expect(mocks.txUpdateSet).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        status: 'processing',
        startedAt: expect.any(Date),
      })
    );
    expect(mocks.txUpdateReturning).toHaveBeenCalledWith({ id: {} });
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.txUpdate).toHaveBeenCalledTimes(3);
    expect(mocks.txUpdate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ __name: 'ai_runs' })
    );
    expect(mocks.txUpdateSet).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        status: 'completed',
        outputJson: analysis,
        completedAt: expect.any(Date),
      })
    );
    expect(mocks.txUpdate).toHaveBeenNthCalledWith(3, { __name: 'policies' });
    expect(mocks.txUpdateSet).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        provider: 'Acme Insurance',
        policyNumber: 'POL-123',
        analysisJson: analysis,
      })
    );
    expect(mocks.txInsert).toHaveBeenCalledWith(
      expect.objectContaining({ __name: 'document_extractions' })
    );
    expect(mocks.txInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'extraction-1',
        tenantId: 'tenant-1',
        documentId: 'document-1',
        entityType: 'policy',
        entityId: 'policy-1',
        workflow: 'policy_extract',
        schemaVersion: 'policy_extract_v1',
        extractedJson: analysis,
        warnings: ['Confirm deductible.'],
        sourceRunId: 'run-1',
        reviewStatus: 'pending',
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      })
    );
    expect(mocks.txInsertOnConflictDoNothing).toHaveBeenCalledWith({
      target: { __name: 'document_extractions.source_run_id' },
    });
  });

  it('fails the run before persistence when policy extraction does not satisfy the strict schema', async () => {
    const result = await processPolicyAnalysisRunService({
      runId: 'run-1',
      ingress,
      tenantId: 'tenant-1',
      deps: {
        downloadFile: vi.fn().mockResolvedValue(Buffer.from('pdf-bytes')),
        analyzeImage: vi.fn(),
        analyzePdf: vi
          .fn()
          .mockResolvedValue(
            'Valid text content from PDF that is definitely longer than fifty characters.'
          ),
        analyzeText: vi.fn().mockResolvedValue({
          provider: 'Acme Insurance',
          policyNumber: 'POL-123',
          coverageAmount: '100000',
          currency: 'EUR',
          deductible: 500,
          confidence: 0.83,
          warnings: [],
        }),
      },
    });

    expect(result).toEqual({ status: 'failed', runId: 'run-1', policyId: 'policy-1' });
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.txUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        errorCode: 'policy_extract_validation_failed',
        completedAt: expect.any(Date),
      })
    );
  });
});
