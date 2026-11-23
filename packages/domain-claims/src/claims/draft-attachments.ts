import { and, claimDocuments, eq, inArray, type TenantTransaction } from '@interdomestik/database';
import { lockClaimEvidenceObjects } from '@interdomestik/database/claim-evidence-object-lock';

import type { CreateClaimValues } from '../validators/claims';
import { ClaimValidationError } from './claim-validation-error';

export type DraftClaimFile = NonNullable<CreateClaimValues['files']>[number];

type EvidenceObject = { bucket: string; path: string };

export type DraftAttachmentPlan = {
  /** Verified entries whose exact object is already a document of this claim: not re-inserted. */
  alreadyAttached: DraftClaimFile[];
  /** Verified entries that create a document row. */
  newFiles: DraftClaimFile[];
};

export type AttachedObject = { bucket: string; claimId: string; filePath: string };

function objectKey(bucket: string, path: string): string {
  return JSON.stringify([bucket, path]);
}

function attachedElsewhere(): ClaimValidationError {
  return new ClaimValidationError(
    'Invalid file path detected. Evidence must be uploaded by the claimant.',
    'INVALID_PATH'
  );
}

/** Refuses a payload that names the same storage object twice (draft update and submit). */
export function assertDistinctEvidenceObjects(files: readonly EvidenceObject[]): void {
  const seen = new Set<string>();
  for (const file of files) {
    const key = objectKey(file.bucket, file.path);
    if (seen.has(key)) {
      throw new ClaimValidationError('The same file was sent twice.', 'INVALID_PAYLOAD');
    }
    seen.add(key);
  }
}

/** Takes the per-object locks every writer of these objects takes before its re-read. */
export async function lockEvidenceObjects(
  tx: TenantTransaction,
  params: { tenantId: string; files: readonly EvidenceObject[] }
): Promise<void> {
  await lockClaimEvidenceObjects(tx, params.tenantId, params.files);
}

/**
 * Reads the tenant's document rows that point at any of the requested paths, on whichever claim
 * they belong to. The caller decides per (bucket, path) whether the object is this claim's own,
 * another claim's, or not attached. With `lockRows`, the rows found stay locked FOR SHARE until
 * the transaction ends: they can be neither deleted nor changed under a decision that rests on
 * them.
 */
export function readAttachedObjects(
  tx: TenantTransaction,
  params: { tenantId: string; files: readonly EvidenceObject[]; lockRows?: boolean }
): Promise<AttachedObject[]> {
  if (params.files.length === 0) return Promise.resolve([]);
  const paths = [...new Set(params.files.map(file => file.path))];
  const query = tx
    .select({
      bucket: claimDocuments.bucket,
      claimId: claimDocuments.claimId,
      filePath: claimDocuments.filePath,
    })
    .from(claimDocuments)
    .where(
      and(eq(claimDocuments.tenantId, params.tenantId), inArray(claimDocuments.filePath, paths))
    );
  return params.lockRows ? query.for('share') : query;
}

/**
 * Splits the requested files into objects already attached to this claim (no-ops) and new ones.
 * An object already attached to another claim of the tenant is refused: one stored object is
 * never the document of two claims.
 */
export function planDraftAttachments(params: {
  attached: readonly AttachedObject[];
  claimId: string;
  files: readonly DraftClaimFile[];
}): DraftAttachmentPlan {
  const ownKeys = new Set<string>();
  const foreignKeys = new Set<string>();
  for (const row of params.attached) {
    const key = objectKey(row.bucket, row.filePath);
    if (row.claimId === params.claimId) ownKeys.add(key);
    else foreignKeys.add(key);
  }

  const plan: DraftAttachmentPlan = { alreadyAttached: [], newFiles: [] };
  for (const file of params.files) {
    const key = objectKey(file.bucket, file.path);
    if (ownKeys.has(key)) plan.alreadyAttached.push(file);
    else if (foreignKeys.has(key)) throw attachedElsewhere();
    else plan.newFiles.push(file);
  }
  return plan;
}

/**
 * For a claim being created: under the object locks, refuses any object that is already the
 * document of a claim. Must run inside the transaction that inserts the rows.
 */
export async function assertEvidenceObjectsUnattached(
  tx: TenantTransaction,
  params: { tenantId: string; files: readonly EvidenceObject[] }
): Promise<void> {
  if (params.files.length === 0) return;
  await lockEvidenceObjects(tx, params);
  const attached = await readAttachedObjects(tx, params);
  const requested = new Set(params.files.map(file => objectKey(file.bucket, file.path)));
  if (attached.some(row => requested.has(objectKey(row.bucket, row.filePath)))) {
    throw attachedElsewhere();
  }
}
