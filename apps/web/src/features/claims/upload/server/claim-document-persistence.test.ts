import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  emit: vi.fn(),
  insert: vi.fn(),
  markDispatchFailed: vi.fn(),
  queue: vi.fn(),
  randomUUID: vi.fn(() => 'consent-1'),
  values: vi.fn(),
}));

vi.mock('@/lib/ai/claim-workflows', () => ({
  emitClaimAiRunRequestedService: hoisted.emit,
  markClaimAiRunDispatchFailedService: hoisted.markDispatchFailed,
}));

vi.mock('@interdomestik/database', () => ({
  claimDocumentAiExtractionConsents: 'claim_document_ai_extraction_consents',
  claimDocuments: 'claim_documents',
  db: {
    transaction: vi.fn(async callback => callback({ insert: hoisted.insert })),
  },
}));

vi.mock('@interdomestik/domain-claims/claims/ai-workflows', () => ({
  queueClaimDocumentAiWorkflows: hoisted.queue,
}));

vi.mock('node:crypto', async importOriginal => {
  const actual = await importOriginal<typeof import('node:crypto')>();
  return { ...actual, default: actual, randomUUID: hoisted.randomUUID };
});

import { persistClaimDocumentAndQueueWorkflows } from './claim-document-persistence';

function baseParams() {
  return {
    category: 'evidence' as const,
    claimId: 'claim-1',
    fileId: 'doc-1',
    fileSize: 1024,
    logPrefix: '[test]',
    mimeType: 'application/pdf',
    originalName: 'evidence.pdf',
    resolvedBucket: 'claim-evidence',
    storagePath: 'pii/tenants/tenant-1/claims/claim-1/doc-1.pdf',
    tenantId: 'tenant-1',
    userId: 'member-1',
  };
}

describe('persistClaimDocumentAndQueueWorkflows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.insert.mockReturnValue({ values: hoisted.values });
    hoisted.values.mockResolvedValue(undefined);
    hoisted.queue.mockResolvedValue([]);
  });

  it('preserves document upload and skips dispatch when unchecked consent queues no AI runs', async () => {
    await persistClaimDocumentAndQueueWorkflows({
      ...baseParams(),
      aiExtractionConsent: {
        granted: false,
        locale: 'en',
        privacyVersion: 'privacy-2026-05',
        sourceSurface: 'member_claim_evidence_upload',
      },
    });

    expect(hoisted.insert).toHaveBeenCalledWith('claim_documents');
    expect(hoisted.insert).not.toHaveBeenCalledWith('claim_document_ai_extraction_consents');
    expect(hoisted.queue).toHaveBeenCalledWith(
      expect.objectContaining({ claimId: 'claim-1', tenantId: 'tenant-1', userId: 'member-1' })
    );
    expect(hoisted.emit).not.toHaveBeenCalled();
  });

  it('persists scoped consent row only for explicit member opt-in', async () => {
    await persistClaimDocumentAndQueueWorkflows({
      ...baseParams(),
      aiExtractionConsent: {
        granted: true,
        locale: 'en',
        privacyVersion: 'privacy-2026-05',
        sourceSurface: 'member_claim_evidence_upload',
      },
    });

    expect(hoisted.insert).toHaveBeenCalledWith('claim_document_ai_extraction_consents');
    expect(hoisted.values).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        actorId: 'member-1',
        claimId: 'claim-1',
        consentType: 'ai_document_extraction',
        documentId: 'doc-1',
        id: expect.any(String),
        processingPurpose: 'ai_document_extraction',
        privacyVersion: 'privacy-2026-05',
        sourceSurface: 'member_claim_evidence_upload',
        status: 'accepted',
        subjectId: 'member-1',
        tenantId: 'tenant-1',
      })
    );
  });
});
