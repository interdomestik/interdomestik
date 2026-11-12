import {
  assertEvidenceStoragePath,
  buildEvidenceStoragePath,
} from '@/features/claims/upload/server/storage-path';
import type { UploadErr } from './upload-result';
type EvidenceUploadPathResult = { ok: true; path: string } | { ok: false; result: UploadErr };

export function createEvidenceUploadPath(args: {
  actorId: string;
  bucket: string;
  claimId?: string;
  evidenceId: string;
  fileName: string;
  tenantId: string;
}): EvidenceUploadPathResult {
  const { actorId, bucket, claimId, evidenceId, fileName, tenantId } = args;

  try {
    return claimId
      ? createAssignedEvidenceUploadPath({ bucket, claimId, evidenceId, fileName, tenantId })
      : createInitialEvidenceUploadPath({ actorId, bucket, evidenceId, fileName, tenantId });
  } catch {
    return { ok: false, result: { ok: false, status: 400, error: 'Invalid file name' } };
  }
}

function createAssignedEvidenceUploadPath(args: {
  bucket: string;
  claimId: string;
  evidenceId: string;
  fileName: string;
  tenantId: string;
}): { ok: true; path: string } {
  const { bucket, claimId, evidenceId, fileName, tenantId } = args;
  const path = buildEvidenceStoragePath({
    bucket,
    claimId,
    fileId: evidenceId,
    fileName,
    shape: 'assigned',
    tenantId,
  });

  assertEvidenceStoragePath({
    bucket,
    claimId,
    fileId: evidenceId,
    shape: 'assigned',
    storagePath: path,
    tenantId,
  });

  return { ok: true, path };
}

function createInitialEvidenceUploadPath(args: {
  actorId: string;
  bucket: string;
  evidenceId: string;
  fileName: string;
  tenantId: string;
}): { ok: true; path: string } {
  const { actorId, bucket, evidenceId, fileName, tenantId } = args;
  const path = buildEvidenceStoragePath({
    actorId,
    bucket,
    fileId: evidenceId,
    fileName,
    shape: 'initial',
    tenantId,
  });

  assertEvidenceStoragePath({
    actorId,
    bucket,
    fileId: evidenceId,
    shape: 'initial',
    storagePath: path,
    tenantId,
  });

  return { ok: true, path };
}
