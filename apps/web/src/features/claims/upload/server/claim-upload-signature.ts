import { redactSignedUrlErrorDetails } from '@/lib/storage/signed-url-exposure';

const SIGNED_UPLOAD_MAX_ATTEMPTS = 3;
const SIGNED_UPLOAD_RETRY_DELAY_MS = process.env.NODE_ENV === 'test' ? 0 : 250;
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

function shouldRetrySignedUpload(message: string): boolean {
  return TRANSIENT_UPLOAD_ERROR_PATTERNS.some(pattern => pattern.test(message));
}

async function waitForSignedUploadRetry(attempt: number): Promise<void> {
  if (SIGNED_UPLOAD_RETRY_DELAY_MS <= 0) return;
  const delay = SIGNED_UPLOAD_RETRY_DELAY_MS * attempt;
  await new Promise(resolve => setTimeout(resolve, delay));
}

type SignatureTarget = { bucket: string; path: string; tenantId: string; logPrefix: string };
type ClaimUploadSignature = { signedUrl: string; token: string; deterministicE2E?: true };

export async function requestClaimUploadSignature(
  target: SignatureTarget,
  attempt = 1
): Promise<ClaimUploadSignature | null> {
  const { bucket, path, tenantId, logPrefix } = target;
  const { createTenantSignedUploadUrl } = await import('@/lib/storage/service-role');
  const { data, error } = await createTenantSignedUploadUrl({
    bucket,
    path,
    tenantId,
    context: 'claim evidence signed upload',
    family: 'claims',
    upsert: false,
  });
  if (!error && data?.signedUrl && data?.token) {
    return {
      signedUrl: data.signedUrl,
      token: data.token,
      deterministicE2E: (data as { deterministicE2E?: true }).deterministicE2E,
    };
  }
  const details = redactSignedUrlErrorDetails(error ?? 'Unknown storage error');
  const retryable = shouldRetrySignedUpload(details.message);
  console.error(`${logPrefix} signed URL error`, {
    bucket,
    path,
    detail: details.message,
    attempt,
    maxAttempts: SIGNED_UPLOAD_MAX_ATTEMPTS,
    retryable,
    error: details,
  });
  if (!retryable || attempt >= SIGNED_UPLOAD_MAX_ATTEMPTS) return null;
  await waitForSignedUploadRetry(attempt);
  return requestClaimUploadSignature(target, attempt + 1);
}
