import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { expect, vi } from 'vitest';

import { createInitialClaimUploadIntentToken } from '@/features/claims/upload/server/initial-claim-upload';
import { buildEvidenceStoragePath } from '@/features/claims/upload/server/storage-path';

import { updateDraftClaimCore } from './draft.core';
import { BUCKET, CLAIM, db, MEMBER, TENANT } from './draft-attachment-intent.state';

const authority = mintTestTenantAuthority(TENANT);
let session = { user: { id: MEMBER, role: 'member', tenantId: TENANT } } as never;

/** Makes the next commands run as the draft owner holding `role`. */
export function actAsOwnerWithRole(role: string): void {
  session = { user: { id: MEMBER, role, tenantId: TENANT } } as never;
}

export function initialFile(
  opts: {
    actorId?: string;
    bucket?: string;
    fileId?: string;
    tenantId?: string;
    tokenActorId?: string;
    tokenTenantId?: string;
    tokenSize?: number;
  } = {}
) {
  const fileId = opts.fileId ?? 'file-1';
  const bucket = opts.bucket ?? BUCKET;
  const path = buildEvidenceStoragePath({
    actorId: opts.actorId ?? MEMBER,
    bucket: BUCKET,
    fileId,
    fileName: 'proof.pdf',
    shape: 'initial',
    tenantId: opts.tenantId ?? TENANT,
  });
  const uploadIntentToken = createInitialClaimUploadIntentToken({
    actorId: opts.tokenActorId ?? opts.actorId ?? MEMBER,
    bucket,
    fileId,
    fileSize: opts.tokenSize ?? 100,
    mimeType: 'application/pdf',
    storagePath: path,
    tenantId: opts.tokenTenantId ?? opts.tenantId ?? TENANT,
  });
  return {
    id: fileId,
    name: 'proof.pdf',
    path,
    type: 'application/pdf',
    size: 100,
    bucket,
    classification: 'pii',
    category: 'evidence' as const,
    uploadIntentToken,
  };
}

/** The same file entry without its upload intent token. */
export function withoutToken<T extends { uploadIntentToken?: string }>(
  file: T
): Omit<T, 'uploadIntentToken'> {
  const copy: Partial<T> = { ...file };
  delete copy.uploadIntentToken;
  return copy as Omit<T, 'uploadIntentToken'>;
}

export function update(files: unknown[]) {
  return updateDraftClaimCore({
    authority,
    session,
    requestHeaders: new Headers(),
    claimId: CLAIM,
    data: {
      category: 'vehicle',
      title: 'Draft title',
      companyName: 'Insurer',
      description: 'A description that is long enough to pass.',
      currency: 'EUR',
      files,
    } as never,
  });
}

export function expectNothingWritten() {
  expect(db.updatedClaims).toBe(0);
  expect(db.inserted).toHaveLength(0);
}

export function resetDraftAttachmentFixture(): void {
  vi.clearAllMocks();
  vi.useRealTimers();
  vi.stubEnv('CLAIM_UPLOAD_INTENT_SECRET', 'test-upload-intent-secret-value-123456');
  db.claim = {
    id: CLAIM,
    tenantId: TENANT,
    userId: MEMBER,
    caseLifecycleState: 'draft',
    recoveryLifecycleState: 'not_started',
  };
  session = { user: { id: MEMBER, role: 'member', tenantId: TENANT } } as never;
  db.documents = [];
  db.locks = [];
  db.nextReads = [];
  db.inserted = [];
  db.updatedClaims = 0;
  db.updateMatches = true;
  db.storage.remove.mockResolvedValue({ error: null });
  db.storage.list.mockResolvedValue({
    data: [{ name: 'file-1-proof.pdf', metadata: { size: 100, mimetype: 'application/pdf' } }],
    error: null,
  });
  db.storage.prefix.mockResolvedValue(new TextEncoder().encode('%PDF-1.7\n'));
  db.storage.tail.mockResolvedValue({ bytes: new TextEncoder().encode('%%EOF\n'), offset: 0 });
}
