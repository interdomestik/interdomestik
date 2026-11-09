import { randomUUID } from 'node:crypto';
import {
  E2E_DOCUMENT_FIXTURES,
  E2E_USER_IDS,
} from '../../../../../../../packages/database/src/e2e-role-fixtures';
import { createMutationCopy } from '../../../../../../../packages/database/src/testing/mutation-copy';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { getReplayFixture } from './claim-document-write-replay-fixture';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  ClaimDocumentUploadConflictError,
  persistClaimDocumentMetadata,
} from './claim-document-write';
import { buildEvidenceStoragePath } from './storage-path';

const fake = getReplayFixture();

type PersistParams = Parameters<typeof persistClaimDocumentMetadata>[0];

const copy = createMutationCopy({
  runId: randomUUID(),
  workerId: process.env.VITEST_POOL_ID ?? 'main',
  scenario: 'evidence-replay',
});
const source = E2E_DOCUMENT_FIXTURES.KS_ANCHOR;
const tenantId = copy.id(source.tenantId);
const claimId = copy.id(source.claimId);
const ownerId = copy.id(source.uploadedBy);
const document = copy.row(source);
const newerId = copy.id(E2E_DOCUMENT_FIXTURES.KS_OTHER_MEMBER.id);
const foreign = E2E_DOCUMENT_FIXTURES.MK_FOREIGN_TENANT;
const foreignTenantId = copy.id(foreign.tenantId);
const foreignOwnerId = copy.id(foreign.uploadedBy);
const authority = mintTestTenantAuthority(tenantId);
const REQUEST_ID = copy.id(`${source.id}:information-request`);
const evidencePath = (fileId: string): string =>
  buildEvidenceStoragePath({
    bucket: 'claim-evidence',
    claimId,
    expectedBucket: 'claim-evidence',
    fileId,
    fileName: `${fileId}.pdf`,
    shape: 'assigned',
    tenantId,
  });
const CONSENT = {
  granted: true,
  locale: 'en',
  privacyVersion: 'privacy-2026-05',
  sourceSurface: 'member_claim_evidence_upload',
};
const NEWER = {
  aiExtractionConsent: undefined,
  fileId: newerId,
  originalName: 'newer.pdf',
  storagePath: evidencePath(newerId),
};

function params(overrides: Partial<PersistParams> = {}): PersistParams {
  return {
    authority,
    actorRole: 'member',
    aiExtractionConsent: CONSENT,
    category: 'evidence',
    claimId,
    fileId: document.id,
    fileSize: source.fileSize,
    logPrefix: '[test]',
    mimeType: source.fileType,
    originalName: source.name,
    resolvedBucket: source.bucket,
    storagePath: evidencePath(document.id),
    tenantId,
    userId: ownerId,
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
    expect(documentIds()).toEqual([document.id, newerId]);
    expect(consentDocumentIds()).toEqual([document.id]);
    expect(rowsOf('claim_documents')[0]).toEqual(
      expect.objectContaining({ name: source.name, uploadedBy: ownerId })
    );
    expect(fake.state.contexts).toHaveLength(3);
    for (const context of fake.state.contexts) expect(context).toBe(authority);
  });

  it('commits a retry after the first transaction aborted before commit', async () => {
    fake.state.faults.insertTable = 'claim_document_ai_extraction_consents';
    await expect(persistClaimDocumentMetadata(params())).rejects.toThrow('row-level security');
    expect(documentIds()).toEqual([]);

    fake.state.faults.insertTable = null;
    expect(await persistClaimDocumentMetadata(params())).toBe(true);
    expect(documentIds()).toEqual([document.id]);
    expect(consentDocumentIds()).toEqual([document.id]);
  });

  it('turns concurrent exact confirms into one document and one consent', async () => {
    const results = await Promise.all([
      persistClaimDocumentMetadata(params()),
      persistClaimDocumentMetadata(params()),
    ]);

    expect(results).toEqual([true, false]);
    expect(documentIds()).toEqual([document.id]);
    expect(consentDocumentIds()).toEqual([document.id]);
  });

  it('keeps the trusted admin role on replay', async () => {
    const admin = params({
      actorRole: 'admin',
      aiExtractionConsent: undefined,
      userId: copy.id(E2E_USER_IDS.KS_ADMIN),
    });

    expect(await persistClaimDocumentMetadata(admin)).toBe(true);
    expect(await persistClaimDocumentMetadata(admin)).toBe(false);
    expect(fake.state.contexts).toHaveLength(2);
    for (const context of fake.state.contexts) expect(context).toBe(authority);
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
    ['uploader', { userId: copy.id(E2E_USER_IDS.KS_MEMBER_A2) }],
  ])('rejects a different %s for the original id without overwriting', async (_label, change) => {
    await persistClaimDocumentMetadata(params());
    const before = rowsOf('claim_documents').map(row => ({ ...row }));

    await expect(persistClaimDocumentMetadata(params(change))).rejects.toBeInstanceOf(
      ClaimDocumentUploadConflictError
    );
    expect(rowsOf('claim_documents')).toEqual(before);
    expect(consentDocumentIds()).toEqual([document.id]);
  });

  it('fails closed on an id held by another tenant without reading outside its scope', async () => {
    fake.state.committed = {
      claim_documents: [
        {
          id: document.id,
          tenantId: foreignTenantId,
          claimId: copy.id(foreign.claimId),
          name: 'foreign.pdf',
          uploadedBy: foreignOwnerId,
        },
      ],
    };

    const error = await persistClaimDocumentMetadata(params()).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(ClaimDocumentUploadConflictError);
    expect((error as Error).message).not.toMatch(/foreign/);
    expect((error as Error).message).not.toContain(foreignTenantId);
    expect((error as Error).message).not.toContain(foreignOwnerId);
    expect(fake.state.reads).toEqual([
      {
        table: 'claim_documents',
        predicate: {
          all: [
            { column: 'id', value: document.id },
            { column: 'tenantId', value: tenantId },
            { column: 'claimId', value: claimId },
            { column: 'uploadedBy', value: ownerId },
          ],
        },
      },
    ]);
    expect(rowsOf('claim_documents')).toEqual([
      expect.objectContaining({ name: 'foreign.pdf', tenantId: foreignTenantId }),
    ]);
    expect(consentDocumentIds()).toEqual([]);
  });

  it('neither succeeds nor overwrites when reading the existing metadata fails', async () => {
    await persistClaimDocumentMetadata(params());
    fake.state.faults.selectTable = 'claim_documents';

    await expect(persistClaimDocumentMetadata(params())).rejects.toThrow('permission denied');
    expect(documentIds()).toEqual([document.id]);
    expect(consentDocumentIds()).toEqual([document.id]);
  });
});

describe('persistClaimDocumentMetadata request-linked replay', () => {
  it('keeps one evidence link and audit row on an exact replay', async () => {
    fake.state.committed = {
      claims: [{ id: claimId, tenantId, userId: ownerId }],
      claim_information_requests: [{ id: REQUEST_ID, claimId, tenantId, status: 'open' }],
    };
    const linked = params({ actorRole: undefined, informationRequestId: REQUEST_ID });

    expect(await persistClaimDocumentMetadata(linked)).toBe(true);
    expect(await persistClaimDocumentMetadata(linked)).toBe(false);
    expect(rowsOf('claim_information_request_evidence')).toHaveLength(1);
    expect(rowsOf('audit_log')).toHaveLength(1);
    expect(consentDocumentIds()).toEqual([document.id]);
    expect(fake.state.contexts).toHaveLength(2);
    for (const context of fake.state.contexts) expect(context).toBe(authority);
  });
});
