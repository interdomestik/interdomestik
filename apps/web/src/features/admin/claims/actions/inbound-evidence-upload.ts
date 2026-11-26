'use server';

import { createHash } from 'node:crypto';
import { z } from 'zod';
import { withPrincipalTenantContext } from '@interdomestik/database/free-start-drafts';
import {
  INBOUND_PDF_MAX_BYTES,
  inboundUploadDecisionInput,
  loadInboundUploadDecision,
  recordInboundUploadDecision,
  type InboundUploadDecision,
} from '@interdomestik/domain-claims/claims/inbound-upload';
import { confirmClaimEvidence } from '@interdomestik/domain-documents/claim-evidence';
import { readTenantAuthority } from '@interdomestik/database/tenant-authority';
import { actionFailure, defineAction, defineFormAction } from '@/lib/safe-action';
import { parameterFreeFailure } from '@/actions/staff-claims/register-failure';
import { resolveEvidenceBucketName } from '@/lib/storage/evidence-bucket';
import { downloadTenantObject, uploadTenantObject } from '@/lib/storage/service-role';
import { isClaimUploadPaused } from '@/features/claims/upload/server/claim-upload-cutover';
import {
  createInboundUploadIntent,
  readInboundUploadIntent,
} from '@/features/claims/upload/server/claim-upload-intent';
import { buildEvidenceStoragePath } from '@/features/claims/upload/server/storage-path';
import { revalidatePathForAllLocales } from '@/features/claims/upload/server/shared-upload';
import {
  evidenceSignatureMatches,
  resolveEvidenceFormat,
} from '@/features/claims/upload/evidence-file-policy';

const claimIdInput = inboundUploadDecisionInput.shape.claimId;

function fingerprint(decision: InboundUploadDecision) {
  return createHash('sha256')
    .update(
      JSON.stringify([
        decision.id,
        decision.tenantId,
        decision.claimId,
        decision.recipientId,
        decision.uploaderId,
        decision.documentId,
        decision.bucket,
        decision.filePath,
        decision.fileName,
        decision.mimeType,
        decision.fileSize,
        decision.sha256,
      ])
    )
    .digest('hex');
}

const recordDecision = defineAction({
  name: 'claims.inboundEvidence.recordDecision',
  basis: { kind: 'role', roles: ['staff', 'tenant_admin'] },
  subject: { type: 'claim', from: 'claimId' },
  input: inboundUploadDecisionInput,
  async handler(input, { authority }) {
    const { tenantId } = readTenantAuthority(authority);
    if (await isClaimUploadPaused(authority, tenantId, input.claimId))
      return actionFailure('FORBIDDEN');
    const bucket = resolveEvidenceBucketName();
    const result = await recordInboundUploadDecision(authority, input, {
      bucket,
      pathForDocument: fileId =>
        buildEvidenceStoragePath({
          tenantId,
          bucket,
          claimId: input.claimId,
          fileId,
          fileName: 'document.pdf',
          shape: 'assigned',
        }),
    });
    if (!result.ok) return actionFailure(result.code === 'forbidden' ? 'FORBIDDEN' : 'conflict');
    return { decisionId: result.decisionId };
  },
});

export async function recordInboundEvidenceDecision(input: unknown) {
  return recordDecision(input);
}

const issueIntent = defineAction({
  name: 'claims.inboundEvidence.issueIntent',
  basis: { kind: 'role', roles: ['staff'] },
  subject: { type: 'claim', from: 'claimId' },
  input: z.strictObject({ claimId: claimIdInput, decisionId: z.uuid() }),
  async handler({ claimId, decisionId }, { authority }) {
    const { tenantId } = readTenantAuthority(authority);
    if (await isClaimUploadPaused(authority, tenantId, claimId)) return actionFailure('FORBIDDEN');
    const decision = await withPrincipalTenantContext(authority, tx =>
      loadInboundUploadDecision(tx, authority, claimId, decisionId)
    );
    if (!decision || (!decision.published && Date.now() >= decision.expiresAt)) {
      return actionFailure('FORBIDDEN');
    }
    return {
      intentToken: createInboundUploadIntent({
        claimId,
        decisionId,
        fingerprint: fingerprint(decision),
        expiresAt: decision.expiresAt,
      }),
    };
  },
});

export async function issueInboundEvidenceIntent(input: unknown) {
  return issueIntent(input);
}

function sha256(bytes: ArrayBuffer) {
  return createHash('sha256').update(Buffer.from(bytes)).digest('hex');
}

async function saveApprovedObject(decision: InboundUploadDecision, file: File) {
  const target = {
    tenantId: decision.tenantId,
    bucket: decision.bucket,
    path: decision.filePath,
    family: 'claims' as const,
  };
  const { error: uploadError } = await uploadTenantObject({
    ...target,
    body: file,
    contentType: decision.mimeType,
    upsert: false,
  });
  const { data: stored, error: readError } = await downloadTenantObject(target);
  if (readError || stored?.size !== decision.fileSize)
    throw parameterFreeFailure(readError ?? uploadError, 'inbound PDF storage verification');
  if (sha256(await stored.arrayBuffer()) !== decision.sha256)
    throw parameterFreeFailure(uploadError, 'inbound PDF storage verification');
}

const upload = defineFormAction({
  name: 'claims.inboundEvidence.upload',
  basis: { kind: 'role', roles: ['staff'] },
  subject: { type: 'claim', from: 'claimId' },
  input: z.strictObject({
    claimId: claimIdInput,
    intentToken: z.string().min(1).max(2048),
    file: z.file().min(1).max(INBOUND_PDF_MAX_BYTES).mime('application/pdf'),
  }),
  async handler({ claimId, intentToken, file }, { authority }) {
    const { tenantId } = readTenantAuthority(authority);
    if (await isClaimUploadPaused(authority, tenantId, claimId)) return actionFailure('FORBIDDEN');
    const intent = readInboundUploadIntent(intentToken, claimId);
    if (!intent) return actionFailure('FORBIDDEN');

    const decision = await withPrincipalTenantContext(authority, tx =>
      loadInboundUploadDecision(tx, authority, claimId, intent.decisionId)
    );
    if (!decision || fingerprint(decision) !== intent.fingerprint)
      return actionFailure('FORBIDDEN');
    const bytes = await file.arrayBuffer();
    const format = resolveEvidenceFormat(file.name, file.type);
    if (
      file.name !== decision.fileName ||
      file.size !== decision.fileSize ||
      format?.signature !== 'pdf' ||
      !evidenceSignatureMatches(format, new Uint8Array(bytes)) ||
      sha256(bytes) !== decision.sha256
    ) {
      return actionFailure('document_invalid');
    }
    if (decision.published) return { documentId: decision.documentId };
    if (Date.now() >= intent.expiresAt) return actionFailure('FORBIDDEN');

    await saveApprovedObject(decision, file);

    const published = await withPrincipalTenantContext(authority, async tx => {
      const current = await loadInboundUploadDecision(tx, authority, claimId, intent.decisionId, {
        forPublication: true,
      });
      if (!current || fingerprint(current) !== intent.fingerprint) return false;
      if (current.published) return true;
      if (Date.now() >= intent.expiresAt) return false;
      const status = await confirmClaimEvidence(tx, {
        verifiedScope: { tenantId, claimId, actorId: current.uploaderId },
        verifiedUpload: {
          fileId: current.documentId,
          originalName: current.fileName,
          storagePath: current.filePath,
          mimeType: current.mimeType,
          fileSize: current.fileSize,
          bucket: current.bucket,
          category: 'evidence',
        },
      });
      return status === 'created' || status === 'replayed';
    });
    if (!published) return actionFailure('conflict');
    revalidatePathForAllLocales(`/staff/claims/${claimId}`);
    revalidatePathForAllLocales(`/member/claims/${claimId}`);
    revalidatePathForAllLocales('/member/documents');
    return { documentId: decision.documentId };
  },
});

export async function uploadInboundEvidence(prevState: unknown, form: FormData) {
  return upload(prevState, form);
}
