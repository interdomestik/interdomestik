import { mocks } from './claim-workflows-extraction.test-support';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emitClaimAiRunRequestedService } from './claim-workflows';

describe('emitClaimAiRunRequestedService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps claim workflows to the correct Inngest event names', async () => {
    await emitClaimAiRunRequestedService({
      runId: 'run-1',
      tenantId: 'tenant-1',
      workflow: 'claim_intake_extract',
      claimId: 'claim-1',
      documentId: 'doc-1',
    });
    await emitClaimAiRunRequestedService({
      runId: 'run-2',
      tenantId: 'tenant-1',
      workflow: 'legal_doc_extract',
      claimId: 'claim-1',
      documentId: 'doc-2',
    });

    expect(mocks.inngestSend).toHaveBeenNthCalledWith(1, {
      name: 'claim/intake-extract.requested',
      data: {
        runId: 'run-1',
        tenantId: 'tenant-1',
        workflow: 'claim_intake_extract',
        claimId: 'claim-1',
        documentId: 'doc-1',
      },
    });
    expect(mocks.inngestSend).toHaveBeenNthCalledWith(2, {
      name: 'legal/extract.requested',
      data: {
        runId: 'run-2',
        tenantId: 'tenant-1',
        workflow: 'legal_doc_extract',
        claimId: 'claim-1',
        documentId: 'doc-2',
      },
    });
  });
});
