import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  extractClaimIntake: vi.fn(),
  extractLegalDocument: vi.fn(),
  mintClaimDocumentAiCallContext: vi.fn(),
  resolveClaimDocumentAiExtractionConsent: vi.fn(),
}));

vi.mock('@/lib/db.server', () => ({ db: {} }));
vi.mock('@interdomestik/domain-ai/claims/intake-extract', () => ({
  extractClaimIntake: mocks.extractClaimIntake,
}));
vi.mock('@interdomestik/domain-ai/legal/extract', () => ({
  extractLegalDocument: mocks.extractLegalDocument,
}));
vi.mock('@interdomestik/domain-claims', () => ({
  mintClaimDocumentAiCallContext: mocks.mintClaimDocumentAiCallContext,
  resolveClaimDocumentAiExtractionConsent: mocks.resolveClaimDocumentAiExtractionConsent,
}));

import { extractClaimAiCandidate } from './claim-pipeline-input';

describe('extractClaimAiCandidate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveClaimDocumentAiExtractionConsent.mockResolvedValue({
      kind: 'granted',
      grant: { consentEventId: 'consent-1', recordedAt: '2026-06-21T10:00:00.000Z' },
    });
    mocks.mintClaimDocumentAiCallContext.mockReturnValue({});
    mocks.extractClaimIntake.mockResolvedValue({
      title: 'Flight delay claim',
      summary: 'Extracted from claim context.',
      category: 'travel',
      incidentDate: '2026-03-08',
      countryCode: 'ZZ',
      estimatedAmount: 650,
      currency: 'EUR',
      confidence: 0.62,
      warnings: [],
    });
  });

  it('normalizes malformed claim snapshots before extraction', async () => {
    await extractClaimAiCandidate({
      runId: 'run-1',
      tenantId: 'tenant-1',
      workflow: 'claim_intake_extract',
      documentId: 'doc-1',
      claimId: 'claim-1',
      requestedBy: 'user-1',
      subjectId: 'member-1',
      storagePath: 'pii/tenants/tenant-1/claims/claim-1/evidence.pdf',
      fileName: 'evidence.pdf',
      mimeType: 'application/pdf',
      uploadedAt: new Date('2026-03-08T10:00:00.000Z'),
      requestJson: { claimSnapshot: { incidentDate: '15/02/2026', other: 'ignored' } },
      claimTitle: 'Flight delay claim',
      claimDescription: 'Delay overnight.',
      claimCategory: 'travel',
      claimAmount: '650.00',
      claimCurrency: 'EUR',
      bucket: 'claim-evidence',
      fileBuffer: Buffer.from('pdf-bytes'),
      documentText: 'Country: IT',
      metrics: { byteLength: 9, textLength: 11, hasText: true },
    });

    expect(mocks.extractClaimIntake).toHaveBeenCalledWith(
      expect.objectContaining({ claimSnapshot: { incidentDate: null } })
    );
  });

  it('does not run extraction when consent is blocked', async () => {
    mocks.resolveClaimDocumentAiExtractionConsent.mockResolvedValue({
      kind: 'blocked',
      reason: 'consent_missing',
    });

    await expect(
      extractClaimAiCandidate({
        runId: 'run-1',
        tenantId: 'tenant-1',
        workflow: 'claim_intake_extract',
        documentId: 'doc-1',
        claimId: 'claim-1',
        requestedBy: 'user-1',
        subjectId: 'member-1',
        storagePath: 'pii/tenants/tenant-1/claims/claim-1/evidence.pdf',
        fileName: 'evidence.pdf',
        mimeType: 'application/pdf',
        uploadedAt: new Date('2026-03-08T10:00:00.000Z'),
        requestJson: {},
        claimTitle: 'Flight delay claim',
        claimDescription: 'Delay overnight.',
        claimCategory: 'travel',
        claimAmount: '650.00',
        claimCurrency: 'EUR',
        bucket: 'claim-evidence',
        fileBuffer: Buffer.from('pdf-bytes'),
        documentText: 'Country: IT',
        metrics: { byteLength: 9, textLength: 11, hasText: true },
      })
    ).rejects.toThrow(/consent_missing/);

    expect(mocks.mintClaimDocumentAiCallContext).not.toHaveBeenCalled();
    expect(mocks.extractClaimIntake).not.toHaveBeenCalled();
  });
});
