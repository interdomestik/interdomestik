import { createHmac, timingSafeEqual } from 'node:crypto';

import { assertEvidenceStoragePath } from './storage-path';

const CLAIM_UPLOAD_INTENT_TTL_MS = 15 * 60 * 1000;

type ClaimUploadIntentPayload = {
  actorId: string;
  bucket: string;
  claimId: string;
  expiresAt: number;
  fileId: string;
  fileSize: number;
  informationRequestId: string | null;
  mimeType: string;
  storageContentType: string;
  storagePath: string;
  tenantId: string;
  v: 1;
};

export type ConfirmedUploadValidationResult =
  { success: true } | { success: false; error: string; status: 409 | 500 };

type IntentFields = {
  actorId: string;
  bucket: string;
  claimId: string;
  fileId: string;
  fileSize: number;
  informationRequestId?: string;
  mimeType: string;
  storageContentType?: string;
  storagePath: string;
  tenantId: string;
};

function intentFailure(): ConfirmedUploadValidationResult {
  return {
    success: false,
    error: 'Upload confirmation expired. Please retry upload.',
    status: 409,
  };
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

export function expectedUploadPath(params: {
  bucket: string;
  claimId: string;
  expectedBucket?: string;
  fileId: string;
  storagePath: string;
  tenantId: string;
}): boolean {
  try {
    assertEvidenceStoragePath({ ...params, shape: 'assigned' });
    return true;
  } catch {
    return false;
  }
}

export function createClaimUploadIntentToken(params: IntentFields): string {
  const payload: ClaimUploadIntentPayload = {
    ...params,
    expiresAt: Date.now() + CLAIM_UPLOAD_INTENT_TTL_MS,
    informationRequestId: params.informationRequestId ?? null,
    storageContentType: params.storageContentType ?? params.mimeType,
    v: 1,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = signUploadIntentPayload(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export function verifyClaimUploadIntentToken(
  params: IntentFields & { intentToken: string }
): ConfirmedUploadValidationResult {
  const { intentToken, ...expected } = params;
  const tokenParts = intentToken.split('.');
  if (tokenParts.length !== 2) return intentFailure();

  const [encodedPayload, signature] = tokenParts;
  if (!safeCompare(signature, signUploadIntentPayload(encodedPayload))) return intentFailure();

  let payload: ClaimUploadIntentPayload;
  try {
    payload = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8')
    ) as ClaimUploadIntentPayload;
  } catch {
    return intentFailure();
  }

  if (
    payload.v !== 1 ||
    payload.expiresAt < Date.now() ||
    payload.actorId !== expected.actorId ||
    payload.bucket !== expected.bucket ||
    payload.claimId !== expected.claimId ||
    payload.fileId !== expected.fileId ||
    payload.fileSize !== expected.fileSize ||
    (payload.informationRequestId ?? null) !== (expected.informationRequestId ?? null) ||
    payload.mimeType !== expected.mimeType ||
    payload.storageContentType !== (expected.storageContentType ?? expected.mimeType) ||
    payload.storagePath !== expected.storagePath ||
    payload.tenantId !== expected.tenantId ||
    !expectedUploadPath(expected)
  ) {
    return intentFailure();
  }

  return { success: true };
}
