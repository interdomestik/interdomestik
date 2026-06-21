import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
  const txInsertValues = vi.fn();
  const txInsert = vi.fn(() => ({ values: txInsertValues }));
  return {
    getResponsesWorkflowConfig: vi.fn((workflow: string) => ({
      workflow,
      model: 'gpt-5.5',
      promptVersion:
        workflow === 'legal_doc_extract' ? 'legal_doc_extract_v1' : 'claim_intake_extract_v1',
      promptCacheKey: `interdomestik:${workflow}:gpt-5.5`,
    })),
    nanoid: vi.fn(),
    txInsert,
    txInsertValues,
  };
});

vi.mock('@interdomestik/database', () => ({
  aiRuns: { __name: 'ai_runs' },
  documents: { __name: 'documents' },
  claimDocumentAiExtractionConsents: new Proxy(
    { __name: 'claim_document_ai_extraction_consents' },
    { get: (target, key) => Reflect.get(target, key) ?? String(key) }
  ),
}));

vi.mock('@interdomestik/domain-ai/models', () => ({
  getResponsesWorkflowConfig: hoisted.getResponsesWorkflowConfig,
}));

vi.mock('nanoid', () => ({ nanoid: hoisted.nanoid }));
vi.mock('drizzle-orm', () => ({ and: vi.fn(), desc: vi.fn(), eq: vi.fn() }));

import { queueClaimDocumentAiWorkflows } from './ai-workflows';

const acceptedConsent = {
  id: 'consent-1',
  tenantId: 'tenant-1',
  actorId: 'member-1',
  subjectId: 'member-1',
  claimId: 'claim-1',
  documentId: 'doc-1',
  consentType: 'ai_document_extraction',
  processingPurpose: 'ai_document_extraction',
  status: 'accepted',
  privacyVersion: 'privacy-2026-05',
  locale: 'en',
  sourceSurface: 'member_claim_evidence_upload',
  recordedAt: new Date('2026-06-21T10:00:00Z'),
  grantedAt: new Date('2026-06-21T10:00:00Z'),
  withdrawnAt: null,
};

function limitConsentRows(consentRows: unknown[]) {
  return vi.fn(async () => consentRows);
}

function orderConsentRows(consentRows: unknown[]) {
  return vi.fn(() => ({ limit: limitConsentRows(consentRows) }));
}

function whereConsentRows(consentRows: unknown[]) {
  return vi.fn(() => ({ orderBy: orderConsentRows(consentRows) }));
}

function fromConsentRows(consentRows: unknown[]) {
  return vi.fn(() => ({ where: whereConsentRows(consentRows) }));
}

function createTx(consentRows: unknown[]) {
  return {
    insert: hoisted.txInsert,
    select: vi.fn(() => ({ from: fromConsentRows(consentRows) })),
  };
}

function queueWith(consentRows: unknown[]) {
  return queueClaimDocumentAiWorkflows({
    tx: createTx(consentRows),
    claimId: 'claim-1',
    tenantId: 'tenant-1',
    userId: 'member-1',
    files: [
      {
        documentId: 'doc-1',
        name: 'evidence.pdf',
        path: 'pii/tenants/tenant-1/claims/claim-1/doc-1.pdf',
        type: 'application/pdf',
        size: 1024,
        bucket: 'claim-evidence',
        category: 'evidence',
      },
    ],
  });
}

describe('queueClaimDocumentAiWorkflows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.nanoid.mockReturnValue('run-1');
  });

  it('skips AI queueing when no trusted consent resolver exists', async () => {
    const queuedRuns = await queueClaimDocumentAiWorkflows({
      tx: { insert: hoisted.txInsert },
      claimId: 'claim-1',
      tenantId: 'tenant-1',
      userId: 'member-1',
      files: [
        {
          documentId: 'doc-1',
          name: 'evidence.pdf',
          path: 'p',
          type: 'application/pdf',
          size: 1,
          bucket: 'b',
        },
      ],
    });

    expect(queuedRuns).toEqual([]);
    expect(hoisted.txInsert).not.toHaveBeenCalled();
  });

  it('skips AI queueing without matching accepted consent', async () => {
    await expect(queueWith([])).resolves.toEqual([]);
    await expect(queueWith([{ ...acceptedConsent, subjectId: 'other-member' }])).resolves.toEqual(
      []
    );
    await expect(queueWith([{ ...acceptedConsent, status: 'withdrawn' }])).resolves.toEqual([]);
    expect(hoisted.txInsert).not.toHaveBeenCalled();
  });

  it('queues an AI run that requires durable consent re-minting at execution time', async () => {
    const queuedRuns = await queueWith([acceptedConsent]);

    expect(queuedRuns).toEqual([
      { runId: 'run-1', workflow: 'claim_intake_extract', claimId: 'claim-1', documentId: 'doc-1' },
    ]);
    expect(hoisted.txInsert).toHaveBeenNthCalledWith(1, { __name: 'documents' });
    expect(hoisted.txInsert).toHaveBeenNthCalledWith(2, { __name: 'ai_runs' });
    const aiRunValues = hoisted.txInsertValues.mock.calls[1][0];
    expect(hoisted.txInsertValues).toHaveBeenNthCalledWith(
      2,
      expect.arrayContaining([
        expect.objectContaining({
          id: 'run-1',
          requestJson: expect.objectContaining({
            aiCallContextStorage: 'durable_consent_remint_required',
          }),
        }),
      ])
    );
    expect(aiRunValues[0].requestJson).not.toHaveProperty('aiCallContext');
  });
});
