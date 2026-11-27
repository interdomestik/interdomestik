import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  emit: vi.fn(),
  insert: vi.fn(),
  markDispatchFailed: vi.fn(),
  queue: vi.fn(),
  randomUUID: vi.fn(() => 'consent-1'),
  returning: vi.fn(),
  selectLimit: vi.fn(),
  values: vi.fn(),
}));

vi.mock('@/lib/ai/claim-workflows', () => ({
  emitClaimAiRunRequestedService: hoisted.emit,
  markClaimAiRunDispatchFailedService: hoisted.markDispatchFailed,
}));

vi.mock('@interdomestik/database', () => {
  const tenantTx = () => ({
    execute: () => Promise.resolve([]),
    insert: hoisted.insert,
    select: () => ({
      from: () => ({
        where: () => ({
          limit: hoisted.selectLimit,
          for: async () => [{ tenantId: 'tenant-1', userId: 'member-1' }],
        }),
      }),
    }),
  });
  return {
    and: (...args: unknown[]) => args,
    claimDocumentAiExtractionConsents: 'claim_document_ai_extraction_consents',
    claimDocuments: 'claim_documents',
    claims: { id: 'claim.id', tenantId: 'claim.tenant_id' },
    claimInformationRequestEvidence: 'claim_information_request_evidence',
    db: {
      transaction: vi.fn(async callback => callback({ insert: hoisted.insert })),
    },
    eq: (left: unknown, right: unknown) => [left, right],
    isNull: (left: unknown) => [left, null],
    withTenantContext: vi.fn(async (_context, callback) => callback(tenantTx())),
  };
});

vi.mock('@interdomestik/domain-claims/claims/ai-workflows', () => ({
  queueClaimDocumentAiWorkflows: hoisted.queue,
}));

vi.mock('node:crypto', async importOriginal => {
  const actual = await importOriginal<typeof import('node:crypto')>();
  return { ...actual, default: actual, randomUUID: hoisted.randomUUID };
});

import { persistClaimDocumentAndQueueWorkflows } from './claim-document-persistence';
import { ClaimDocumentUploadConflictError } from './claim-document-write';
import { db, withTenantContext } from '@interdomestik/database';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';

const CONSENT = {
  granted: true,
  locale: 'en',
  privacyVersion: 'privacy-2026-05',
  sourceSurface: 'member_claim_evidence_upload',
};

const EXISTING_ROW = {
  id: 'doc-1',
  tenantId: 'tenant-1',
  claimId: 'claim-1',
  name: 'evidence.pdf',
  filePath: 'pii/tenants/tenant-1/claims/claim-1/doc-1.pdf',
  fileType: 'application/pdf',
  fileSize: 1024,
  bucket: 'claim-evidence',
  category: 'evidence',
  uploadedBy: 'member-1',
};

const authority = mintTestTenantAuthority('tenant-1', { userId: 'member-1', role: 'member' });

function baseParams() {
  return {
    authority,
    actorRole: 'member' as const,
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
    // Document inserts use insert-or-skip with RETURNING; consent inserts await values() directly.
    hoisted.values.mockImplementation(() => ({
      onConflictDoNothing: () => ({ returning: hoisted.returning }),
      then: (resolve: (value: unknown) => unknown) => resolve(undefined),
    }));
    hoisted.returning.mockResolvedValue([{ id: 'doc-1' }]);
    hoisted.selectLimit.mockResolvedValue([]);
    hoisted.queue.mockResolvedValue([]);
  });

  it('preserves document upload in one tenant transaction with AI dormant', async () => {
    await persistClaimDocumentAndQueueWorkflows({
      ...baseParams(),
      aiExtractionConsent: { ...CONSENT, granted: false },
    });

    expect(hoisted.insert).toHaveBeenCalledWith('claim_documents');
    expect(hoisted.insert).not.toHaveBeenCalledWith('claim_document_ai_extraction_consents');
    expect(hoisted.queue).not.toHaveBeenCalled();
    expect(hoisted.emit).not.toHaveBeenCalled();
    expect(vi.mocked(withTenantContext).mock.calls.map(([context]) => context)).toEqual([
      authority,
    ]);
    for (const [context] of vi.mocked(withTenantContext).mock.calls)
      expect(context).toBe(authority);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('records explicit member consent without queueing or dispatching AI', async () => {
    await persistClaimDocumentAndQueueWorkflows({
      ...baseParams(),
      aiExtractionConsent: CONSENT,
    });
    expect(hoisted.queue).not.toHaveBeenCalled();
    expect(hoisted.emit).not.toHaveBeenCalled();
    expect(hoisted.markDispatchFailed).not.toHaveBeenCalled();

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

  it('skips consent, queue, and dispatch when an exact replay finds the committed document', async () => {
    hoisted.returning.mockResolvedValueOnce([]);
    hoisted.selectLimit
      .mockResolvedValueOnce([EXISTING_ROW])
      .mockResolvedValueOnce([{ ...CONSENT, actorId: 'member-1' }]);

    await persistClaimDocumentAndQueueWorkflows({ ...baseParams(), aiExtractionConsent: CONSENT });

    expect(hoisted.insert).toHaveBeenCalledTimes(1);
    expect(hoisted.insert).not.toHaveBeenCalledWith('claim_document_ai_extraction_consents');
    expect(hoisted.queue).not.toHaveBeenCalled();
    expect(hoisted.emit).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('fails closed without consent or queue when the original id holds different metadata', async () => {
    hoisted.returning.mockResolvedValueOnce([]);
    hoisted.selectLimit.mockResolvedValueOnce([{ ...EXISTING_ROW, name: 'other.pdf' }]);

    await expect(
      persistClaimDocumentAndQueueWorkflows({ ...baseParams(), aiExtractionConsent: CONSENT })
    ).rejects.toBeInstanceOf(ClaimDocumentUploadConflictError);
    expect(hoisted.insert).not.toHaveBeenCalledWith('claim_document_ai_extraction_consents');
    expect(hoisted.queue).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
  });
});
