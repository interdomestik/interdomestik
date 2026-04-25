import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
  const txInsertValues = vi.fn();
  const txInsert = vi.fn(() => ({
    values: txInsertValues,
  }));

  return {
    getDefaultModelForWorkflow: vi.fn((workflow: string) =>
      workflow === 'legal_doc_extract' ? 'gpt-5.5' : 'gpt-5-mini'
    ),
    nanoid: vi.fn().mockReturnValueOnce('run-1').mockReturnValueOnce('run-2'),
    txInsert,
    txInsertValues,
  };
});

vi.mock('@interdomestik/database', () => ({
  aiRuns: { __name: 'ai_runs' },
  documents: { __name: 'documents' },
}));

vi.mock('@interdomestik/domain-ai/models', () => ({
  getDefaultModelForWorkflow: hoisted.getDefaultModelForWorkflow,
}));

vi.mock('nanoid', () => ({
  nanoid: hoisted.nanoid,
}));

import { queueClaimDocumentAiWorkflows } from './ai-workflows';

describe('queueClaimDocumentAiWorkflows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.nanoid.mockReturnValueOnce('run-1').mockReturnValueOnce('run-2');
  });

  it('dual-writes canonical documents and queued ai runs for claim and legal categories', async () => {
    const queuedRuns = await queueClaimDocumentAiWorkflows({
      tx: {
        insert: hoisted.txInsert,
      },
      claimId: 'claim-1',
      tenantId: 'tenant-1',
      userId: 'member-1',
      files: [
        {
          documentId: 'legacy-doc-1',
          name: 'evidence.pdf',
          path: 'pii/tenants/tenant-1/claims/member-1/evidence.pdf',
          type: 'application/pdf',
          size: 1024,
          bucket: 'claim-evidence',
          category: 'evidence',
        },
        {
          documentId: 'legacy-doc-2',
          name: 'demand-letter.pdf',
          path: 'pii/tenants/tenant-1/claims/claim-1/demand-letter.pdf',
          type: 'application/pdf',
          size: 2048,
          bucket: 'claim-evidence',
          category: 'legal',
        },
      ],
      claimSnapshot: {
        title: 'Damaged baggage',
        description: 'The airline lost my luggage.',
        category: 'travel',
        companyName: 'Airline Co',
        claimAmount: '1200.00',
        currency: 'EUR',
        incidentDate: '2026-02-15',
      },
    });

    expect(queuedRuns).toEqual([
      expect.objectContaining({
        runId: 'run-1',
        workflow: 'claim_intake_extract',
        claimId: 'claim-1',
        documentId: 'legacy-doc-1',
      }),
      expect.objectContaining({
        runId: 'run-2',
        workflow: 'legal_doc_extract',
        claimId: 'claim-1',
        documentId: 'legacy-doc-2',
      }),
    ]);

    expect(hoisted.txInsert).toHaveBeenNthCalledWith(1, { __name: 'documents' });
    expect(hoisted.txInsertValues).toHaveBeenNthCalledWith(
      1,
      expect.arrayContaining([
        expect.objectContaining({
          id: 'legacy-doc-1',
          tenantId: 'tenant-1',
          entityType: 'claim',
          entityId: 'claim-1',
          fileName: 'evidence.pdf',
          category: 'evidence',
          storagePath: 'pii/tenants/tenant-1/claims/member-1/evidence.pdf',
          uploadedBy: 'member-1',
          uploadedAt: expect.any(Date),
        }),
        expect.objectContaining({
          id: 'legacy-doc-2',
          category: 'legal',
        }),
      ])
    );

    expect(hoisted.txInsert).toHaveBeenNthCalledWith(2, { __name: 'ai_runs' });
    expect(hoisted.txInsertValues).toHaveBeenNthCalledWith(
      2,
      expect.arrayContaining([
        expect.objectContaining({
          id: 'run-1',
          workflow: 'claim_intake_extract',
          documentId: 'legacy-doc-1',
          entityType: 'claim',
          entityId: 'claim-1',
          model: 'gpt-5-mini',
          promptVersion: 'claim_intake_extract_v1',
          reviewStatus: 'pending',
          requestJson: expect.objectContaining({
            category: 'evidence',
            bucket: 'claim-evidence',
            claimSnapshot: expect.objectContaining({
              incidentDate: '2026-02-15',
            }),
          }),
        }),
        expect.objectContaining({
          id: 'run-2',
          workflow: 'legal_doc_extract',
          documentId: 'legacy-doc-2',
          model: 'gpt-5.5',
          promptVersion: 'legal_doc_extract_v1',
          requestJson: expect.objectContaining({
            category: 'legal',
          }),
        }),
      ])
    );
  });
});
