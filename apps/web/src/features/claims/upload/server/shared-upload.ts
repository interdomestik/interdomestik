'use server';

import {
  emitClaimAiRunRequestedService,
  markClaimAiRunDispatchFailedService,
} from '@/lib/ai/claim-workflows';
import { LOCALES } from '@/i18n/locales';
import { claimDocuments, db } from '@interdomestik/database';
import { queueClaimDocumentAiWorkflows } from '@interdomestik/domain-claims/claims/ai-workflows';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { revalidatePath } from 'next/cache';

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

export type UploadCategory = 'evidence' | 'legal';

export type SharedGenerateUploadUrlResult =
  | { success: true; url: string; path: string; id: string; token: string; bucket: string }
  | { success: false; error: string; status: 413 | 500 };

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

export async function createSignedUploadUrl(params: {
  bucket: string;
  claimId: string;
  fileName: string;
  fileSize: number;
  logPrefix: string;
  tenantId: string;
}): Promise<SharedGenerateUploadUrlResult> {
  const { bucket, claimId, fileName, fileSize, logPrefix, tenantId } = params;

  if (fileSize > 50 * 1024 * 1024) {
    return { success: false, error: 'File too large (max 50MB)', status: 413 };
  }

  const ext = fileName.split('.').pop() || 'bin';
  const fileId = randomUUID();
  const path = `pii/tenants/${tenantId}/claims/${claimId}/${fileId}.${ext}`;
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase configuration');
    return { success: false, error: 'Configuration error', status: 500 };
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

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
