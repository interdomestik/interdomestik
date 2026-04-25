import {
  emitClaimAiRunRequestedService,
  markClaimAiRunDispatchFailedService,
} from '@/lib/ai/claim-workflows';
import { LOCALES } from '@/i18n/locales';
import { claimDocuments, db } from '@interdomestik/database';
import { queueClaimDocumentAiWorkflows } from '@interdomestik/domain-claims/claims/ai-workflows';
import { createClient } from '@supabase/supabase-js';
import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { revalidatePath } from 'next/cache';

const SIGNED_UPLOAD_MAX_ATTEMPTS = 3;
const SIGNED_UPLOAD_RETRY_DELAY_MS = process.env.NODE_ENV === 'test' ? 0 : 250;
const CLAIM_UPLOAD_MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
const CLAIM_UPLOAD_INTENT_TTL_MS = 15 * 60 * 1000;
const TRANSIENT_UPLOAD_ERROR_PATTERNS = [
  /fetch failed/i,
  /network/i,
  /timed?\s*out/i,
  /econnreset/i,
  /ehostunreach/i,
  /enotfound/i,
  /socket hang up/i,
  /temporar/i,
  /service unavailable/i,
  /too many requests/i,
];

export type UploadCategory = 'evidence' | 'legal';

export type SharedGenerateUploadUrlResult =
  | {
      success: true;
      url: string;
      path: string;
      id: string;
      token: string;
      bucket: string;
      intentToken: string;
    }
  | { success: false; error: string; status: 400 | 413 | 500 };

type ClaimUploadIntentPayload = {
  actorId: string;
  bucket: string;
  claimId: string;
  expiresAt: number;
  fileId: string;
  fileSize: number;
  mimeType: string;
  storageContentType: string;
  storagePath: string;
  tenantId: string;
  v: 1;
};

export type ConfirmedUploadValidationResult =
  | { success: true }
  | { success: false; error: string; status: 409 | 500 };

export type ClaimUploadConfirmationInput = {
  claimId: string;
  fileId: string;
  fileSize: number;
  mimeType: string;
  storageContentType?: string;
  storagePath: string;
  uploadIntentToken: string;
};

function shouldRetrySignedUpload(message: string): boolean {
  return TRANSIENT_UPLOAD_ERROR_PATTERNS.some(pattern => pattern.test(message));
}

async function waitForSignedUploadRetry(attempt: number): Promise<void> {
  if (SIGNED_UPLOAD_RETRY_DELAY_MS <= 0) return;
  const delay = SIGNED_UPLOAD_RETRY_DELAY_MS * attempt;
  await new Promise(resolve => setTimeout(resolve, delay));
}

export function revalidatePathForAllLocales(path: string) {
  for (const locale of LOCALES) {
    revalidatePath(`/${locale}${path}`);
  }
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function getClaimUploadIntentSecret(): string {
  const secret = process.env.CLAIM_UPLOAD_INTENT_SECRET ?? process.env.BETTER_AUTH_SECRET;

  if (!secret || secret.length < 24) {
    throw new Error('CLAIM_UPLOAD_INTENT_SECRET or BETTER_AUTH_SECRET is required for uploads');
  }

  return secret;
}

function signUploadIntentPayload(encodedPayload: string): string {
  return createHmac('sha256', getClaimUploadIntentSecret())
    .update(encodedPayload)
    .digest('base64url');
}

function safeCompare(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);

  return aBuffer.length === bBuffer.length && timingSafeEqual(aBuffer, bBuffer);
}

export function sanitizeClaimUploadExtension(fileName: string): string {
  const ext =
    fileName
      .split('.')
      .pop()
      ?.toLowerCase()
      .replaceAll(/[^a-z0-9]/g, '') || 'bin';
  return ext.slice(0, 16) || 'bin';
}

function expectedUploadPath(params: {
  claimId: string;
  fileId: string;
  storagePath: string;
  tenantId: string;
}): boolean {
  const { claimId, fileId, storagePath, tenantId } = params;
  const expectedPrefix = `pii/tenants/${tenantId}/claims/${claimId}/${fileId}.`;

  return (
    storagePath.startsWith(expectedPrefix) &&
    !storagePath.includes('..') &&
    storagePath.split('/').length === 6
  );
}

export function createClaimUploadIntentToken(params: {
  actorId: string;
  bucket: string;
  claimId: string;
  fileId: string;
  fileSize: number;
  mimeType: string;
  storageContentType?: string;
  storagePath: string;
  tenantId: string;
}): string {
  const payload: ClaimUploadIntentPayload = {
    ...params,
    expiresAt: Date.now() + CLAIM_UPLOAD_INTENT_TTL_MS,
    storageContentType: params.storageContentType ?? params.mimeType,
    v: 1,
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = signUploadIntentPayload(encodedPayload);

  return `${encodedPayload}.${signature}`;
}

function verifyClaimUploadIntentToken(params: {
  actorId: string;
  bucket: string;
  claimId: string;
  fileId: string;
  fileSize: number;
  intentToken: string;
  mimeType: string;
  storageContentType?: string;
  storagePath: string;
  tenantId: string;
}): ConfirmedUploadValidationResult {
  const { intentToken, ...expected } = params;
  const tokenParts = intentToken.split('.');

  if (tokenParts.length !== 2) {
    return {
      success: false,
      error: 'Upload confirmation expired. Please retry upload.',
      status: 409,
    };
  }

  const [encodedPayload, signature] = tokenParts;

  const expectedSignature = signUploadIntentPayload(encodedPayload);
  if (!safeCompare(signature, expectedSignature)) {
    return {
      success: false,
      error: 'Upload confirmation expired. Please retry upload.',
      status: 409,
    };
  }

  let payload: ClaimUploadIntentPayload;
  try {
    payload = JSON.parse(base64UrlDecode(encodedPayload)) as ClaimUploadIntentPayload;
  } catch {
    return {
      success: false,
      error: 'Upload confirmation expired. Please retry upload.',
      status: 409,
    };
  }

  if (
    payload.v !== 1 ||
    payload.expiresAt < Date.now() ||
    payload.actorId !== expected.actorId ||
    payload.bucket !== expected.bucket ||
    payload.claimId !== expected.claimId ||
    payload.fileId !== expected.fileId ||
    payload.fileSize !== expected.fileSize ||
    payload.mimeType !== expected.mimeType ||
    payload.storageContentType !== (expected.storageContentType ?? expected.mimeType) ||
    payload.storagePath !== expected.storagePath ||
    payload.tenantId !== expected.tenantId
  ) {
    return {
      success: false,
      error: 'Upload confirmation expired. Please retry upload.',
      status: 409,
    };
  }

  return { success: true };
}

function getSupabaseStorageClient(logPrefix: string) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error(`${logPrefix} missing Supabase configuration`);
    return null;
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}

function numberFromMetadata(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function stringFromMetadata(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function getObjectMetadataValue(metadata: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (metadata[key] !== undefined) return metadata[key];
  }

  return undefined;
}

export async function validateStoredObject(params: {
  bucket: string;
  fileSize: number;
  logPrefix: string;
  mimeType: string;
  storagePath: string;
}): Promise<ConfirmedUploadValidationResult> {
  const { bucket, fileSize, logPrefix, mimeType, storagePath } = params;
  const lastSlashIndex = storagePath.lastIndexOf('/');
  const folder = storagePath.slice(0, lastSlashIndex);
  const fileName = storagePath.slice(lastSlashIndex + 1);
  const supabase = getSupabaseStorageClient(logPrefix);

  if (!supabase) {
    return { success: false, error: 'Configuration error', status: 500 };
  }

  const { data, error } = await supabase.storage.from(bucket).list(folder, {
    limit: 100,
    search: fileName,
  });

  if (error) {
    console.error(`${logPrefix} storage object verification failed`, {
      bucket,
      storagePath,
      detail: error.message,
    });
    return { success: false, error: 'Failed to verify uploaded file', status: 500 };
  }

  const storedObject = data?.find(object => object.name === fileName);
  if (!storedObject) {
    return {
      success: false,
      error: 'Uploaded file was not found. Please retry upload.',
      status: 409,
    };
  }

  const metadata = (storedObject.metadata ?? {}) as Record<string, unknown>;
  const storedSize = numberFromMetadata(
    getObjectMetadataValue(metadata, ['size', 'contentLength', 'content_length'])
  );
  const storedMimeType = stringFromMetadata(
    getObjectMetadataValue(metadata, ['mimetype', 'mimeType', 'contentType', 'content_type'])
  );

  if (storedSize !== fileSize || storedMimeType !== mimeType) {
    return {
      success: false,
      error: 'Uploaded file metadata mismatch. Please retry upload.',
      status: 409,
    };
  }

  return { success: true };
}

export async function validateConfirmedClaimUpload(params: {
  actorId: string;
  bucket: string;
  confirmation: ClaimUploadConfirmationInput;
  logPrefix: string;
  tenantId: string;
}): Promise<ConfirmedUploadValidationResult> {
  const { actorId, bucket, confirmation, logPrefix, tenantId } = params;
  const {
    claimId,
    fileId,
    fileSize,
    mimeType,
    storageContentType,
    storagePath,
    uploadIntentToken,
  } = confirmation;

  if (
    !Number.isSafeInteger(fileSize) ||
    fileSize <= 0 ||
    fileSize > CLAIM_UPLOAD_MAX_FILE_SIZE_BYTES ||
    !expectedUploadPath({ claimId, fileId, storagePath, tenantId })
  ) {
    return {
      success: false,
      error: 'Uploaded file metadata mismatch. Please retry upload.',
      status: 409,
    };
  }

  const intentResult = verifyClaimUploadIntentToken({
    actorId,
    bucket,
    claimId,
    fileId,
    fileSize,
    intentToken: uploadIntentToken,
    mimeType,
    storageContentType,
    storagePath,
    tenantId,
  });

  if (!intentResult.success) {
    return intentResult;
  }

  return validateStoredObject({
    bucket,
    fileSize,
    logPrefix,
    mimeType: storageContentType ?? mimeType,
    storagePath,
  });
}

export async function createSignedUploadUrl(params: {
  actorId: string;
  bucket: string;
  claimId: string;
  fileName: string;
  fileSize: number;
  logPrefix: string;
  mimeType: string;
  tenantId: string;
}): Promise<SharedGenerateUploadUrlResult> {
  const { actorId, bucket, claimId, fileName, fileSize, logPrefix, mimeType, tenantId } = params;

  if (!Number.isSafeInteger(fileSize) || fileSize <= 0) {
    return { success: false, error: 'Invalid file size', status: 400 };
  }

  if (fileSize > CLAIM_UPLOAD_MAX_FILE_SIZE_BYTES) {
    return { success: false, error: 'File too large (max 50MB)', status: 413 };
  }

  const ext = sanitizeClaimUploadExtension(fileName);
  const fileId = randomUUID();
  const path = `pii/tenants/${tenantId}/claims/${claimId}/${fileId}.${ext}`;
  const supabase = getSupabaseStorageClient(logPrefix);

  if (!supabase) {
    return { success: false, error: 'Configuration error', status: 500 };
  }

  try {
    for (let attempt = 1; attempt <= SIGNED_UPLOAD_MAX_ATTEMPTS; attempt += 1) {
      const { data, error } = await supabase.storage.from(bucket).createSignedUploadUrl(path, {
        upsert: true,
      });

      if (!error && data?.signedUrl && data?.token) {
        return {
          success: true,
          url: data.signedUrl,
          path,
          id: fileId,
          token: data.token,
          bucket,
          intentToken: createClaimUploadIntentToken({
            actorId,
            bucket,
            claimId,
            fileId,
            fileSize,
            mimeType,
            storagePath: path,
            tenantId,
          }),
        };
      }

      const detail = error?.message ?? 'Unknown storage error';
      const retryable = shouldRetrySignedUpload(detail);
      const hasAttemptsLeft = attempt < SIGNED_UPLOAD_MAX_ATTEMPTS;

      console.error(`${logPrefix} signed URL error`, {
        bucket,
        path,
        detail,
        error,
        attempt,
        maxAttempts: SIGNED_UPLOAD_MAX_ATTEMPTS,
        retryable,
      });

      if (retryable && hasAttemptsLeft) {
        await waitForSignedUploadRetry(attempt);
        continue;
      }

      return { success: false, error: `Failed to generate upload URL: ${detail}`, status: 500 };
    }

    return {
      success: false,
      error: 'Failed to generate upload URL: Unknown storage error',
      status: 500,
    };
  } catch (error) {
    console.error(`${logPrefix} generate upload URL error`, error);
    return { success: false, error: 'Unexpected error', status: 500 };
  }
}

export async function persistClaimDocumentAndQueueWorkflows(params: {
  category: UploadCategory;
  claimId: string;
  fileId: string;
  fileSize: number;
  logPrefix: string;
  mimeType: string;
  originalName: string;
  resolvedBucket: string;
  storagePath: string;
  tenantId: string;
  userId: string;
}): Promise<void> {
  const {
    category,
    claimId,
    fileId,
    fileSize,
    logPrefix,
    mimeType,
    originalName,
    resolvedBucket,
    storagePath,
    tenantId,
    userId,
  } = params;

  await db.transaction(async tx => {
    await tx.insert(claimDocuments).values({
      id: fileId,
      tenantId,
      claimId,
      name: originalName,
      filePath: storagePath,
      fileType: mimeType,
      fileSize,
      bucket: resolvedBucket,
      category,
      uploadedBy: userId,
    });
  });

  try {
    const queuedRuns = await db.transaction(async tx =>
      queueClaimDocumentAiWorkflows({
        tx,
        claimId,
        tenantId,
        userId,
        files: [
          {
            documentId: fileId,
            name: originalName,
            path: storagePath,
            type: mimeType,
            size: fileSize,
            bucket: resolvedBucket,
            category,
          },
        ],
      })
    );

    for (const queuedRun of queuedRuns) {
      try {
        await emitClaimAiRunRequestedService(queuedRun);
      } catch (error) {
        await markClaimAiRunDispatchFailedService({
          runId: queuedRun.runId,
          message: error instanceof Error ? error.message : 'Failed to dispatch claim AI run.',
        });
      }
    }
  } catch (queueError) {
    console.error(`${logPrefix} AI queue failed after metadata persisted`, {
      claimId,
      fileId,
      message: queueError instanceof Error ? queueError.message : String(queueError),
    });
  }
}
