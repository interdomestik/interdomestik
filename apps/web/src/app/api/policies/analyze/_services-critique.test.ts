import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const txInsert = vi.fn(() => ({ values: vi.fn() }));
  const txUpdateSet = vi.fn(() => ({ where: vi.fn(() => ({ returning: vi.fn() })) }));
  const txUpdate = vi.fn(() => ({ set: txUpdateSet }));
  const selectWhere = vi.fn();
  const select = vi.fn(() => ({
    from: vi.fn(() => ({
      innerJoin: vi.fn(() => ({ where: selectWhere })),
    })),
  }));

  return {
    authorizeInngestEventTenant: vi.fn(),
    db: { select },
    selectWhere,
    txInsert,
    txUpdate,
    txUpdateSet,
    txUpdateReturning: vi.fn().mockResolvedValue([{ id: 'run-1' }]),
    withTenantContext: vi.fn(async (_context: unknown, callback: (tx: unknown) => unknown) =>
      callback({
        insert: txInsert,
        select,
        update: vi.fn(() => ({
          set: txUpdateSet,
        })),
      })
    ),
  };
});

vi.mock('@/lib/db.server', () => ({ db: mocks.db }));
vi.mock('@interdomestik/database', () => ({
  authorizeInngestEventTenant: mocks.authorizeInngestEventTenant,
  withTenantContext: mocks.withTenantContext,
}));
vi.mock('@interdomestik/database/schema', () => ({
  aiRuns: { __name: 'ai_runs', id: { __name: 'ai_runs.id' }, status: {} },
  documentExtractions: { __name: 'document_extractions', sourceRunId: {} },
  documents: { __name: 'documents', deletedAt: {}, id: {} },
  policies: { __name: 'policies' },
}));
vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => ({ args })),
  eq: vi.fn((left: unknown, right: unknown) => ({ left, right })),
  isNull: vi.fn((field: unknown) => ({ field })),
}));

import type { IngressCapability } from '@interdomestik/database/ingress';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';

import { processPolicyAnalysisRunService } from './_services';

const authorities = new Map<string, ReturnType<typeof mintTestTenantAuthority>>();
function authorityFor(tenantId: string) {
  let authority = authorities.get(tenantId);
  if (!authority) {
    authority = mintTestTenantAuthority(tenantId);
    authorities.set(tenantId, authority);
  }
  return authority;
}
const ingress = Object.freeze({}) as unknown as IngressCapability<'inngest'>;

describe('processPolicyAnalysisRunService critique gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizeInngestEventTenant.mockImplementation(
      async (_ingress: unknown, tenantId: string) => authorityFor(tenantId)
    );
    mocks.selectWhere.mockResolvedValue([
      {
        runId: 'run-1',
        tenantId: 'tenant-1',
        documentId: 'document-1',
        policyId: 'policy-1',
        storagePath: 'pii/tenants/tenant-1/policies/user-1/file.png',
        requestJson: { fileName: 'file.png', mimeType: 'image/png' },
        status: 'queued',
      },
    ]);
    mocks.withTenantContext.mockImplementation(
      async (_context: unknown, callback: (tx: unknown) => unknown) =>
        callback({
          insert: mocks.txInsert,
          select: mocks.db.select,
          update: vi.fn(() => ({
            set: mocks.txUpdateSet,
          })),
        })
    );
    mocks.txUpdateSet.mockReturnValue({
      where: vi.fn(() => ({ returning: mocks.txUpdateReturning })),
    });
  });

  it('marks the run failed and skips extraction persistence for failed critique', async () => {
    const result = await processPolicyAnalysisRunService({
      runId: 'run-1',
      ingress,
      tenantId: 'tenant-1',
      deps: {
        downloadFile: vi.fn().mockResolvedValue(Buffer.alloc(0)),
        analyzeImage: vi.fn().mockResolvedValue({
          provider: null,
          policyNumber: null,
          coverageAmount: 0,
          currency: 'EUR',
          deductible: 0,
          confidence: 0,
          warnings: ['Image analysis produced no usable content.'],
        }),
        analyzePdf: vi.fn(),
        analyzeText: vi.fn(),
      },
    });

    expect(result).toEqual({ status: 'failed', runId: 'run-1', policyId: 'policy-1' });
    expect(mocks.txInsert).not.toHaveBeenCalled();
    expect(mocks.txUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        errorCode: 'policy_extract_critique_failed',
      })
    );
  });
});
