import type { EvidenceFile } from '@interdomestik/domain-claims/validators/claims';
import { createHmac, timingSafeEqual } from 'node:crypto';

import { validateStoredObject } from './shared-upload';

const INITIAL_CLAIM_UPLOAD_INTENT_TTL_MS = 15 * 60 * 1000;

type InitialClaimUploadIntentPayload = {
  actorId: string;
  bucket: string;
  expiresAt: number;
  fileId: string;
  fileSize: number;
  mimeType: string;
  storagePath: string;
  tenantId: string;
  v: 1;
};

type ValidationResult = { success: true } | { success: false; error: string };

function getInitialClaimUploadIntentSecret(): string {
  const secret = process.env.CLAIM_UPLOAD_INTENT_SECRET ?? process.env.BETTER_AUTH_SECRET;

  if (!secret || secret.length < 24) {
    throw new Error('CLAIM_UPLOAD_INTENT_SECRET or BETTER_AUTH_SECRET is required for uploads');
  }

  return secret;
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function signUploadIntentPayload(encodedPayload: string): string {
  return createHmac('sha256', getInitialClaimUploadIntentSecret())
    .update(encodedPayload)
    .digest('base64url');
}

function safeCompare(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);

  return aBuffer.length === bBuffer.length && timingSafeEqual(aBuffer, bBuffer);
}

export function expectedInitialClaimUploadPath(params: {
  actorId: string;
  fileId: string;
  storagePath: string;
  tenantId: string;
}): boolean {
  const { actorId, fileId, storagePath, tenantId } = params;
  const expectedPrefix = `pii/tenants/${tenantId}/claims/${actorId}/unassigned/${fileId}-`;

  return (
    storagePath.startsWith(expectedPrefix) &&
    !storagePath.includes('..') &&
    storagePath.split('/').length === 7
  );
}

export function createInitialClaimUploadIntentToken(params: {
  actorId: string;
  bucket: string;
  fileId: string;
  fileSize: number;
  mimeType: string;
  storagePath: string;
  tenantId: string;
}): string {
  const payload: InitialClaimUploadIntentPayload = {
    ...params,
    expiresAt: Date.now() + INITIAL_CLAIM_UPLOAD_INTENT_TTL_MS,
    v: 1,
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = signUploadIntentPayload(encodedPayload);

  return `${encodedPayload}.${signature}`;
}

export function verifyInitialClaimUploadIntentToken(params: {
  actorId: string;
  bucket: string;
  fileId: string;
  fileSize: number;
  intentToken: string;
  mimeType: string;
  storagePath: string;
  tenantId: string;
}): ValidationResult {
  const { intentToken, ...expected } = params;
  const tokenParts = intentToken.split('.');

  if (tokenParts.length !== 2) {
    return { success: false, error: 'Upload confirmation expired. Please retry upload.' };
  }

  const [encodedPayload, signature] = tokenParts;
  const expectedSignature = signUploadIntentPayload(encodedPayload);

  if (!safeCompare(signature, expectedSignature)) {
    return { success: false, error: 'Upload confirmation expired. Please retry upload.' };
  }

  let payload: InitialClaimUploadIntentPayload;
  try {
    payload = JSON.parse(base64UrlDecode(encodedPayload)) as InitialClaimUploadIntentPayload;
  } catch {
    return { success: false, error: 'Upload confirmation expired. Please retry upload.' };
  }

  if (
    payload.v !== 1 ||
    payload.expiresAt < Date.now() ||
    payload.actorId !== expected.actorId ||
    payload.bucket !== expected.bucket ||
    payload.fileId !== expected.fileId ||
    payload.fileSize !== expected.fileSize ||
    payload.mimeType !== expected.mimeType ||
    payload.storagePath !== expected.storagePath ||
    payload.tenantId !== expected.tenantId ||
    !expectedInitialClaimUploadPath({
      actorId: expected.actorId,
      fileId: expected.fileId,
      storagePath: expected.storagePath,
      tenantId: expected.tenantId,
    })
  ) {
    return { success: false, error: 'Upload confirmation expired. Please retry upload.' };
  }

  return { success: true };
}

export async function validateInitialClaimEvidenceUpload(params: {
  actorId: string;
  expectedBucket: string;
  file: EvidenceFile;
  tenantId: string;
}): Promise<void> {
  const { actorId, expectedBucket, file, tenantId } = params;

  const intentResult = verifyInitialClaimUploadIntentToken({
    actorId,
    bucket: expectedBucket,
    fileId: file.id,
    fileSize: file.size,
    intentToken: file.uploadIntentToken ?? '',
    mimeType: file.type,
    storagePath: file.path,
    tenantId,
  });

  if (!intentResult.success) {
    throw new Error(intentResult.error);
  }

  const storedObjectResult = await validateStoredObject({
    bucket: expectedBucket,
    fileSize: file.size,
    logPrefix: '[claim-wizard-upload]',
    mimeType: file.type,
    storagePath: file.path,
  });

  if (!storedObjectResult.success) {
    throw new Error(storedObjectResult.error);
  }
}
