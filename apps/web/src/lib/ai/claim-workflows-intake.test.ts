import {
  mocks,
  authority,
  ingress,
  buildQueuedRun,
  buildProcessingDeps,
} from './claim-workflows-extraction.test-support';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { processClaimDocumentWorkflowRunService } from './claim-workflows';
import { claimIntakeAiCallContext } from '@/test/ai-call-context';

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

  it('processes a queued claim-intake run and persists a document extraction', async () => {
    mocks.selectWhere.mockResolvedValue([buildQueuedRun()]);
    mocks.extractClaimIntake.mockResolvedValue({
      title: 'Flight delay claim',
      summary: 'Extracted from claim context.',
      category: 'travel',
      incidentDate: '2026-02-15',
      countryCode: 'ZZ',
      estimatedAmount: 650,
      currency: 'EUR',
      confidence: 0.62,
      warnings: ['Country inferred from fallback'],
    });

    const result = await processClaimDocumentWorkflowRunService({
      runId: 'run-1',
      ingress,
      tenantId: 'tenant-1',
      deps: buildProcessingDeps('Country: IT'),
    });

    expect(result).toEqual({
      status: 'completed',
      runId: 'run-1',
      claimId: 'claim-1',
      workflow: 'claim_intake_extract',
      extraction: expect.objectContaining({
        title: 'Flight delay claim',
      }),
    });
    expect(mocks.extractClaimIntake).toHaveBeenCalled();
    expect(mocks.resolveClaimDocumentAiExtractionConsent).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        subjectId: 'member-1',
        claimId: 'claim-1',
        documentId: 'doc-1',
      })
    );
    expect(mocks.extractClaimIntake).toHaveBeenCalledWith(
      expect.objectContaining({
        claimSnapshot: { incidentDate: '2026-02-15' },
      })
    );
    expect(mocks.authorizeInngestEventTenant).toHaveBeenCalledWith(ingress, 'tenant-1');
    expect(mocks.withTenantContext.mock.calls[0]?.[0]).toBe(authority);
    expect(mocks.txUpdate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ __name: 'ai_runs' })
    );
    expect(mocks.txUpdateReturning).toHaveBeenCalledWith({ id: { __name: 'ai_runs.id' } });
    expect(mocks.txInsert).toHaveBeenCalledWith(
      expect.objectContaining({ __name: 'document_extractions' })
    );
    expect(mocks.txInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        schemaVersion: 'claim_schema_version_test',
      })
    );
    expect(mocks.txUpdateSet).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: 'completed',
        completedAt: expect.any(Date),
      })
    );
  });
});
