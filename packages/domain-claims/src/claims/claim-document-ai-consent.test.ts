import { describe, expect, it, vi } from 'vitest';

vi.mock('@interdomestik/database', () => ({
  claimDocumentAiExtractionConsents: new Proxy(
    { __name: 'claim_document_ai_extraction_consents' },
    { get: (target, key) => Reflect.get(target, key) ?? String(key) }
  ),
}));

vi.mock('drizzle-orm', () => ({ and: vi.fn(), desc: vi.fn(), eq: vi.fn() }));

import { resolveClaimDocumentAiExtractionConsent } from './claim-document-ai-consent';

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

function limitConsentRow(row: unknown) {
  return vi.fn(async () => (row ? [row] : []));
}

function orderConsentRow(row: unknown) {
  return vi.fn(() => ({ limit: limitConsentRow(row) }));
}

function whereConsentRow(row: unknown) {
  return vi.fn(() => ({ orderBy: orderConsentRow(row) }));
}

function fromConsentRow(row: unknown) {
  return vi.fn(() => ({ where: whereConsentRow(row) }));
}

function createTx(row: unknown) {
  return {
    select: vi.fn(() => ({ from: fromConsentRow(row) })),
  };
}

function resolve(row: unknown) {
  return resolveClaimDocumentAiExtractionConsent({
    tx: createTx(row),
    tenantId: 'tenant-1',
    subjectId: 'member-1',
    claimId: 'claim-1',
    documentId: 'doc-1',
  });
}

describe('resolveClaimDocumentAiExtractionConsent', () => {
  it('grants only matching accepted ai_document_extraction consent', async () => {
    await expect(resolve(acceptedConsent)).resolves.toEqual({
      kind: 'granted',
      grant: { consentEventId: 'consent-1', recordedAt: '2026-06-21T10:00:00.000Z' },
    });
  });

  it.each([
    ['wrong tenant', { tenantId: 'tenant-2' }],
    ['wrong subject', { subjectId: 'member-2' }],
    ['wrong claim', { claimId: 'claim-2' }],
    ['wrong document', { documentId: 'doc-2' }],
    ['withdrawn latest consent', { status: 'withdrawn' }],
    ['generic terms consent', { consentType: 'privacy_policy' }],
    ['generic purpose consent', { processingPurpose: 'document_storage' }],
  ])('blocks %s', async (_label, override) => {
    await expect(resolve({ ...acceptedConsent, ...override })).resolves.toMatchObject({
      kind: 'blocked',
    });
  });
});
