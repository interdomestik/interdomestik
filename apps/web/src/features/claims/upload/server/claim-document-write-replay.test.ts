import { getReplayFixture } from './claim-document-write-replay-fixture';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  ClaimDocumentUploadConflictError,
  persistClaimDocumentMetadata,
} from './claim-document-write';

const fake = getReplayFixture();

type PersistParams = Parameters<typeof persistClaimDocumentMetadata>[0];

const REQUEST_ID = '00000000-0000-4000-8000-000000000001';
const PATH = 'pii/tenants/tenant-1/claims/claim-1';
const CONSENT = {
  granted: true,
  locale: 'en',
  privacyVersion: 'privacy-2026-05',
  sourceSurface: 'member_claim_evidence_upload',
};
const NEWER = {
  aiExtractionConsent: undefined,
  fileId: 'doc-2',
  originalName: 'newer.pdf',
  storagePath: `${PATH}/doc-2.pdf`,
};

function params(overrides: Partial<PersistParams> = {}): PersistParams {
  return {
    actorRole: 'member',
    aiExtractionConsent: CONSENT,
    category: 'evidence',
    claimId: 'claim-1',
    fileId: 'doc-1',
    fileSize: 1024,
    logPrefix: '[test]',
    mimeType: 'application/pdf',
    originalName: 'evidence.pdf',
    resolvedBucket: 'claim-evidence',
    storagePath: `${PATH}/doc-1.pdf`,
    tenantId: 'tenant-1',
    userId: 'member-1',
    ...overrides,
  };
}

const rowsOf = (name: string) => fake.state.committed[name] ?? [];
const documentIds = () => rowsOf('claim_documents').map(row => row.id);
const consentDocumentIds = () =>
  rowsOf('claim_document_ai_extraction_consents').map(row => row.documentId);

beforeEach(() => {
  fake.state.committed = {};
  fake.state.contexts.length = 0;
  fake.state.faults.insertTable = null;
  fake.state.faults.selectTable = null;
  fake.state.reads.length = 0;
  fake.state.tail = Promise.resolve();
});

describe('persistClaimDocumentMetadata uncertain-response replay', () => {
  it('settles a lost-response replay as not created after a newer append', async () => {
    expect(await persistClaimDocumentMetadata(params())).toBe(true);
    // The committed result above is discarded by the caller; a newer upload then lands.
    expect(await persistClaimDocumentMetadata(params(NEWER))).toBe(true);

    expect(await persistClaimDocumentMetadata(params())).toBe(false);
    expect(documentIds()).toEqual(['doc-1', 'doc-2']);
    expect(consentDocumentIds()).toEqual(['doc-1']);
    expect(rowsOf('claim_documents')[0]).toEqual(
      expect.objectContaining({ name: 'evidence.pdf', uploadedBy: 'member-1' })
    );
    expect(fake.state.contexts).toEqual(Array(3).fill({ tenantId: 'tenant-1', role: 'member' }));
  });

  it('commits a retry after the first transaction aborted before commit', async () => {
    fake.state.faults.insertTable = 'claim_document_ai_extraction_consents';
    await expect(persistClaimDocumentMetadata(params())).rejects.toThrow('row-level security');
    expect(documentIds()).toEqual([]);

    fake.state.faults.insertTable = null;
    expect(await persistClaimDocumentMetadata(params())).toBe(true);
    expect(documentIds()).toEqual(['doc-1']);
    expect(consentDocumentIds()).toEqual(['doc-1']);
  });

  it('turns concurrent exact confirms into one document and one consent', async () => {
    const results = await Promise.all([
      persistClaimDocumentMetadata(params()),
      persistClaimDocumentMetadata(params()),
    ]);

    expect(results).toEqual([true, false]);
    expect(documentIds()).toEqual(['doc-1']);
    expect(consentDocumentIds()).toEqual(['doc-1']);
  });

  it('keeps the trusted admin role on replay', async () => {
    const admin = params({ actorRole: 'admin', aiExtractionConsent: undefined, userId: 'admin-1' });

    expect(await persistClaimDocumentMetadata(admin)).toBe(true);
    expect(await persistClaimDocumentMetadata(admin)).toBe(false);
    expect(fake.state.contexts).toEqual(Array(2).fill({ tenantId: 'tenant-1', role: 'admin' }));
    expect(rowsOf('claim_documents')).toHaveLength(1);
  });
});

describe('persistClaimDocumentMetadata conflicting replay', () => {
  it.each([
    ['name', { originalName: 'renamed.pdf' }],
    ['size', { fileSize: 2048 }],
    ['category', { category: 'legal' as const }],
    ['mime type', { mimeType: 'image/png' }],
    ['bucket', { resolvedBucket: 'other-bucket' }],
    ['uploader', { userId: 'member-2' }],
  ])('rejects a different %s for the original id without overwriting', async (_label, change) => {
    await persistClaimDocumentMetadata(params());
    const before = rowsOf('claim_documents').map(row => ({ ...row }));

    await expect(persistClaimDocumentMetadata(params(change))).rejects.toBeInstanceOf(
      ClaimDocumentUploadConflictError
    );
    expect(rowsOf('claim_documents')).toEqual(before);
    expect(consentDocumentIds()).toEqual(['doc-1']);
  });

  it('fails closed on an id held by another tenant without reading outside its scope', async () => {
    fake.state.committed = {
      claim_documents: [
        {
          id: 'doc-1',
          tenantId: 'tenant-2',
          claimId: 'claim-9',
          name: 'foreign.pdf',
          uploadedBy: 'member-9',
        },
      ],
    };

    const error = await persistClaimDocumentMetadata(params()).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(ClaimDocumentUploadConflictError);
    expect((error as Error).message).not.toMatch(/foreign|tenant-2|member-9/);
    expect(fake.state.reads).toEqual([
      {
        table: 'claim_documents',
        predicate: {
          all: [
            { column: 'id', value: 'doc-1' },
            { column: 'tenantId', value: 'tenant-1' },
            { column: 'claimId', value: 'claim-1' },
            { column: 'uploadedBy', value: 'member-1' },
          ],
        },
      },
    ]);
    expect(rowsOf('claim_documents')).toEqual([
      expect.objectContaining({ name: 'foreign.pdf', tenantId: 'tenant-2' }),
    ]);
    expect(consentDocumentIds()).toEqual([]);
  });

  it('neither succeeds nor overwrites when reading the existing metadata fails', async () => {
    await persistClaimDocumentMetadata(params());
    fake.state.faults.selectTable = 'claim_documents';

    await expect(persistClaimDocumentMetadata(params())).rejects.toThrow('permission denied');
    expect(documentIds()).toEqual(['doc-1']);
    expect(consentDocumentIds()).toEqual(['doc-1']);
  });
});

describe('persistClaimDocumentMetadata request-linked replay', () => {
  it('keeps one evidence link and audit row on an exact replay', async () => {
    fake.state.committed = {
      claims: [{ id: 'claim-1', tenantId: 'tenant-1', userId: 'member-1' }],
      claim_information_requests: [
        { id: REQUEST_ID, claimId: 'claim-1', tenantId: 'tenant-1', status: 'open' },
      ],
    };
    const linked = params({ actorRole: undefined, informationRequestId: REQUEST_ID });

    expect(await persistClaimDocumentMetadata(linked)).toBe(true);
    expect(await persistClaimDocumentMetadata(linked)).toBe(false);
    expect(rowsOf('claim_information_request_evidence')).toHaveLength(1);
    expect(rowsOf('audit_log')).toHaveLength(1);
    expect(consentDocumentIds()).toEqual(['doc-1']);
    expect(fake.state.contexts).toEqual(Array(2).fill({ tenantId: 'tenant-1', role: 'member' }));
  });
});
