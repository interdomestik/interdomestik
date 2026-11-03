import {
  mocks,
  authority,
  ingress,
  buildQueuedRun,
  buildProcessingDeps,
} from './claim-workflows-extraction.test-support';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { processClaimDocumentWorkflowRunService } from './claim-workflows';
import { claimIntakeAiCallContext, createLegalAiCallContext } from '@/test/ai-call-context';

describe('processClaimDocumentWorkflowRunService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizeInngestEventTenant.mockResolvedValue(authority);
    mocks.nanoid.mockReturnValueOnce('extraction-1').mockReturnValueOnce('extraction-2');
    mocks.resolveEvidenceBucketName.mockReturnValue('resolved-evidence-bucket');
    mocks.resolveClaimDocumentAiExtractionConsent.mockResolvedValue({
      kind: 'granted',
      grant: { consentEventId: 'consent-1', recordedAt: '2026-06-21T10:00:00.000Z' },
    });
    mocks.mintClaimDocumentAiCallContext.mockReturnValue(claimIntakeAiCallContext);
    mocks.txInsertValues.mockImplementation(() => ({
      onConflictDoNothing: mocks.txInsertOnConflictDoNothing,
    }));
    mocks.txExecute.mockResolvedValue([{ id: 'doc-1' }]);
    mocks.txUpdateReturning.mockResolvedValue([{ id: 'run-1' }]);
  });

  it('processes a queued legal-document run and persists a legal extraction', async () => {
    mocks.selectWhere.mockResolvedValue([
      buildQueuedRun({
        workflow: 'legal_doc_extract',
        documentId: 'doc-2',
        storagePath: 'pii/tenants/tenant-1/claims/claim-1/demand-letter.pdf',
        fileName: 'demand-letter.pdf',
      }),
    ]);
    mocks.mintClaimDocumentAiCallContext.mockReturnValue(createLegalAiCallContext('doc-2'));
    mocks.extractLegalDocument.mockResolvedValue({
      documentType: 'demand_letter',
      issuer: 'Contoso Legal',
      jurisdiction: 'Germany',
      effectiveDate: '2026-02-20',
      summary: 'Demand letter summary.',
      obligations: ['Respond within 14 days'],
      confidence: 0.74,
      warnings: [],
    });
    const deps = buildProcessingDeps('Demand letter issued by Contoso Legal');

    const result = await processClaimDocumentWorkflowRunService({
      runId: 'run-1',
      ingress,
      tenantId: 'tenant-1',
      deps,
    });

    expect(result).toEqual({
      status: 'completed',
      runId: 'run-1',
      claimId: 'claim-1',
      workflow: 'legal_doc_extract',
      extraction: expect.objectContaining({
        documentType: 'demand_letter',
      }),
    });
    expect(mocks.extractLegalDocument).toHaveBeenCalled();
    expect(mocks.resolveEvidenceBucketName).toHaveBeenCalledTimes(1);
    expect(deps.downloadFile).toHaveBeenCalledWith(
      'resolved-evidence-bucket',
      'pii/tenants/tenant-1/claims/claim-1/demand-letter.pdf',
      'tenant-1'
    );
    expect(mocks.txInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        schemaVersion: 'legal_schema_version_test',
      })
    );
  });
});
