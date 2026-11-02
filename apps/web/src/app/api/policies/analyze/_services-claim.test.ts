import { installServicesHooks } from './_services.hooks.test-support';
import { mocks, authorityFor, ingress } from './_services.test-support';
import { describe, expect, it, vi } from 'vitest';

import { processPolicyAnalysisRunService } from './_services';

describe('processPolicyAnalysisRunService', () => {
  installServicesHooks();

  it('skips when another worker already claimed the queued run', async () => {
    mocks.txUpdateReturning.mockResolvedValueOnce([]);

    const result = await processPolicyAnalysisRunService({
      runId: 'run-1',
      ingress,
      tenantId: 'tenant-1',
      deps: {
        downloadFile: vi.fn(),
        analyzeImage: vi.fn(),
        analyzePdf: vi.fn(),
        analyzeText: vi.fn(),
      },
    });

    expect(result).toEqual({
      status: 'skipped',
      runId: 'run-1',
      policyId: 'policy-1',
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('binds the run lookup and claim update to the event tenant', async () => {
    await processPolicyAnalysisRunService({
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
          coverageAmount: 100000,
          currency: 'EUR',
          deductible: 500,
          confidence: 0.83,
          warnings: [],
          hiddenPerks: [],
          summary: 'Extracted in background.',
        }),
      },
    });

    const tenantPredicate = {
      __op: 'eq',
      left: { __name: 'ai_runs.tenant_id' },
      right: 'tenant-1',
    };
    expect(mocks.authorizeInngestEventTenant).toHaveBeenCalledWith(ingress, 'tenant-1');
    expect(mocks.withTenantContext.mock.calls[0]?.[0]).toBe(authorityFor('tenant-1'));
    expect(mocks.selectWhere.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ args: expect.arrayContaining([tenantPredicate]) })
    );
    expect(mocks.withTenantContext.mock.calls[1]?.[0]).toBe(authorityFor('tenant-1'));
    expect(mocks.txUpdateWhere.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ args: expect.arrayContaining([tenantPredicate]) })
    );
  });

  it('does not update a run that is not visible in the event tenant', async () => {
    // Both tenant-scoped lookups (active join and deleted-document fallback) find nothing.
    mocks.selectWhere.mockResolvedValue([]);

    await expect(
      processPolicyAnalysisRunService({
        runId: 'run-1',
        ingress,
        tenantId: 'tenant-other',
        deps: {
          downloadFile: vi.fn(),
          analyzeImage: vi.fn(),
          analyzePdf: vi.fn(),
          analyzeText: vi.fn(),
        },
      })
    ).rejects.toThrow('Queued policy analysis run run-1 was not found.');

    expect(mocks.withTenantContext).toHaveBeenCalledTimes(2);
    for (const call of mocks.withTenantContext.mock.calls) {
      expect(call[0]).toBe(authorityFor('tenant-other'));
    }
    expect(mocks.txUpdate).not.toHaveBeenCalled();
  });

  it('fails closed without any read or write when the event tenant is not authorized', async () => {
    mocks.authorizeInngestEventTenant.mockRejectedValue(
      new Error('Inngest tenant authority requires an existing tenant')
    );

    await expect(
      processPolicyAnalysisRunService({
        runId: 'run-1',
        ingress,
        tenantId: 'tenant-ghost',
        deps: {
          downloadFile: vi.fn(),
          analyzeImage: vi.fn(),
          analyzePdf: vi.fn(),
          analyzeText: vi.fn(),
        },
      })
    ).rejects.toThrow('Inngest tenant authority requires an existing tenant');

    expect(mocks.authorizeInngestEventTenant).toHaveBeenCalledWith(ingress, 'tenant-ghost');
    expect(mocks.withTenantContext).not.toHaveBeenCalled();
    expect(mocks.txUpdate).not.toHaveBeenCalled();
    expect(mocks.txInsert).not.toHaveBeenCalled();
  });
});
