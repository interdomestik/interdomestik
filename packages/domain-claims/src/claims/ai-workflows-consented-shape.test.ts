import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  config: vi.fn((workflow: string) => ({
    model: 'gpt-5.5',
    promptVersion: `${workflow}_v1`,
    promptCacheKey: `key:${workflow}`,
  })),
  nanoid: vi.fn(),
  txInsert: vi.fn(() => ({ values: vi.fn() })),
}));

vi.mock('@interdomestik/database', () => ({
  aiRuns: { __name: 'ai_runs' },
  documents: { __name: 'documents' },
  claimDocumentAiExtractionConsents: new Proxy({}, { get: (_target, key) => String(key) }),
}));
vi.mock('@interdomestik/domain-ai/models', () => ({ getResponsesWorkflowConfig: hoisted.config }));
vi.mock('nanoid', () => ({ nanoid: hoisted.nanoid }));
vi.mock('drizzle-orm', () => ({
  and: vi.fn((...conditions) => conditions),
  desc: vi.fn(field => field),
  eq: vi.fn((field, value) => ({ field, value })),
}));

import { queueClaimDocumentAiWorkflows } from './ai-workflows';

const baseConsent = {
  tenantId: 'tenant-1',
  actorId: 'member-1',
  subjectId: 'member-1',
  claimId: 'claim-1',
  consentType: 'ai_document_extraction',
  processingPurpose: 'ai_document_extraction',
  status: 'accepted',
  privacyVersion: 'privacy-2026-05',
  locale: 'en',
  sourceSurface: 'member_claim_evidence_upload',
  recordedAt: new Date('2026-06-21T10:00:00Z'),
};

function conditionValue(
  condition: Array<{ field: string; value: unknown }>,
  field: string
): unknown {
  return condition.find(item => item.field === field)?.value;
}

function matchingConsentRows(condition: Array<{ field: string; value: unknown }>) {
  const documentId = conditionValue(condition, 'documentId');
  return vi.fn(async () => [
    {
      ...baseConsent,
      id: `consent-${String(documentId)}`,
      documentId,
    },
  ]);
}

function orderMatchingConsent(condition: Array<{ field: string; value: unknown }>) {
  return vi.fn(() => ({ limit: matchingConsentRows(condition) }));
}

function whereMatchingConsent() {
  return vi.fn((condition: Array<{ field: string; value: unknown }>) => ({
    orderBy: orderMatchingConsent(condition),
  }));
}

function fromConsentTable() {
  return vi.fn(() => ({ where: whereMatchingConsent() }));
}

function createTx() {
  return {
    insert: hoisted.txInsert,
    select: vi.fn(() => ({ from: fromConsentTable() })),
  };
}

describe('queueClaimDocumentAiWorkflows consented insert shape', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.nanoid.mockReturnValue('run-1');
  });

  it('preserves legal and evidence workflow/category mapping when consent is granted', async () => {
    await queueClaimDocumentAiWorkflows({
      tx: createTx(),
      claimId: 'claim-1',
      tenantId: 'tenant-1',
      userId: 'member-1',
      files: [
        {
          documentId: 'doc-evidence-1',
          name: 'evidence.pdf',
          path: 'p1',
          type: 'application/pdf',
          size: 1,
          bucket: 'b',
          category: 'evidence',
        },
        {
          documentId: 'doc-legal-1',
          name: 'legal.pdf',
          path: 'p2',
          type: 'application/pdf',
          size: 2,
          bucket: 'b',
          category: 'legal',
        },
      ],
    });

    const documentValues = hoisted.txInsert.mock.results[0].value.values.mock.calls[0][0];
    const aiRunValues = hoisted.txInsert.mock.results[1].value.values.mock.calls[0][0];
    expect(documentValues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'evidence',
          description: expect.stringContaining('intake'),
        }),
        expect.objectContaining({
          category: 'legal',
          description: expect.stringContaining('legal'),
        }),
      ])
    );
    expect(aiRunValues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ workflow: 'claim_intake_extract' }),
        expect.objectContaining({ workflow: 'legal_doc_extract' }),
      ])
    );
  });
});
