'use server';

import {
  emitClaimAiRunRequestedService,
  markClaimAiRunDispatchFailedService,
} from '@/lib/ai/claim-workflows';
import { auth } from '@/lib/auth';
import { LOCALES } from '@/i18n/locales';
import { resolveEvidenceBucketName } from '@/lib/storage/evidence-bucket';
import { resolveTenantFromHost } from '@/lib/tenant/tenant-hosts';
import { claimDocuments, claims, db } from '@interdomestik/database';
import { queueClaimDocumentAiWorkflows } from '@interdomestik/domain-claims/claims/ai-workflows';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';

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
const ALLOWED_ADMIN_UPLOAD_ROLES = new Set([
  'admin',
  'super_admin',
  'tenant_admin',
  'branch_manager',
  'staff',
]);

function isAdminUploadRole(role: string | null | undefined): boolean {
  return role ? ALLOWED_ADMIN_UPLOAD_ROLES.has(role) : false;
}

function shouldRetrySignedUpload(message: string): boolean {
  return TRANSIENT_UPLOAD_ERROR_PATTERNS.some(pattern => pattern.test(message));
}

async function waitForSignedUploadRetry(attempt: number): Promise<void> {
  if (SIGNED_UPLOAD_RETRY_DELAY_MS <= 0) return;
  const delay = SIGNED_UPLOAD_RETRY_DELAY_MS * attempt;
  await new Promise(resolve => setTimeout(resolve, delay));
}

type UploadContext =
  | {
      success: true;
      session: NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;
      tenantId: string;
      resolvedBucket: string;
    }
  | { success: false; error: string; status: 401 | 500 };

export type GenerateAdminUploadUrlResult =
  | { success: true; url: string; path: string; id: string; token: string; bucket: string }
  | { success: false; error: string; status: 401 | 404 | 413 | 500 };

export type ConfirmAdminUploadResult =
  | { success: true }
  | { success: false; error: string; status: 401 | 404 | 409 | 500 };

export type ConfirmAdminUploadParams = {
  claimId: string;
  storagePath: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  fileId: string;
  uploadedBucket?: string;
  category?: 'evidence' | 'legal';
};

async function resolveAdminUploadContext(): Promise<UploadContext> {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({
    headers: requestHeaders,
  });

  if (!session || !isAdminUploadRole(session.user.role)) {
    return { success: false, error: 'Unauthorized', status: 401 };
  }

  try {
    const tenantId = ensureTenantId(session);
    const requestHost = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host') ?? '';
    const hostTenantId = resolveTenantFromHost(requestHost);

    if (!hostTenantId || hostTenantId !== tenantId) {
      return { success: false, error: 'Unauthorized', status: 401 };
    }

    return {
      success: true,
      session,
      tenantId,
      resolvedBucket: resolveEvidenceBucketName(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upload bucket configuration error';
    console.error('[admin/claims] Bucket configuration error', {
      message,
      nodeEnv: process.env.NODE_ENV,
      vercelEnv: process.env.VERCEL_ENV,
    });
    return { success: false, error: message, status: 500 };
  }
}

async function enqueueDocumentAiWorkflowsBestEffort(input: {
  claimId: string;
  fileId: string;
  originalName: string;
  storagePath: string;
  mimeType: string;
  fileSize: number;
  resolvedBucket: string;
  category: 'evidence' | 'legal';
  tenantId: string;
  userId: string;
}): Promise<void> {
  const {
    claimId,
    fileId,
    originalName,
    storagePath,
    mimeType,
    fileSize,
    resolvedBucket,
    category,
    tenantId,
    userId,
  } = input;

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
    console.error('[admin/claims] confirmAdminUpload AI queue failed after metadata persisted', {
      claimId,
      fileId,
      message: queueError instanceof Error ? queueError.message : String(queueError),
    });
  }
}

function revalidatePathForAllLocales(path: string) {
  for (const locale of LOCALES) {
    revalidatePath(`/${locale}${path}`);
  }
}

function revalidateAdminEvidencePaths(claimId: string) {
  revalidatePathForAllLocales('/admin/claims');
  revalidatePathForAllLocales(`/admin/claims/${claimId}`);
  revalidatePathForAllLocales(`/staff/claims/${claimId}`);
  revalidatePathForAllLocales(`/member/claims/${claimId}`);
  revalidatePathForAllLocales('/member/documents');
}

export async function generateAdminUploadUrl(
  claimId: string,
  fileName: string,
  contentType: string,
  fileSize: number
): Promise<GenerateAdminUploadUrlResult> {
  const uploadContext = await resolveAdminUploadContext();
  if (!uploadContext.success) {
    return uploadContext;
  }

  const { tenantId, resolvedBucket } = uploadContext;
  const claim = await db.query.claims.findFirst({
    where: and(eq(claims.id, claimId), eq(claims.tenantId, tenantId)),
  });

  if (!claim) {
    return { success: false, error: 'Claim not found', status: 404 };
  }

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
      const { data, error } = await supabase.storage
        .from(resolvedBucket)
        .createSignedUploadUrl(path, { upsert: true });

      if (!error && data?.signedUrl && data?.token) {
        return {
          success: true,
          url: data.signedUrl,
          path,
          id: fileId,
          token: data.token,
          bucket: resolvedBucket,
        };
      }

      const detail = error?.message ?? 'Unknown storage error';
      const retryable = shouldRetrySignedUpload(detail);
      const hasAttemptsLeft = attempt < SIGNED_UPLOAD_MAX_ATTEMPTS;

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
    console.error('[admin/claims] generateAdminUploadUrl error', error);
    return { success: false, error: 'Unexpected error', status: 500 };
  }
}

export async function confirmAdminUpload({
  claimId,
  storagePath,
  originalName,
  mimeType,
  fileSize,
  fileId,
  uploadedBucket,
  category = 'evidence',
}: ConfirmAdminUploadParams): Promise<ConfirmAdminUploadResult> {
  const uploadContext = await resolveAdminUploadContext();
  if (!uploadContext.success) {
    return uploadContext;
  }

  const { session, tenantId, resolvedBucket } = uploadContext;
  const claim = await db.query.claims.findFirst({
    where: and(eq(claims.id, claimId), eq(claims.tenantId, tenantId)),
  });

  if (!claim) {
    return { success: false, error: 'Claim not found', status: 404 };
  }

  try {
    if (uploadedBucket && uploadedBucket !== resolvedBucket) {
      return {
        success: false,
        error: 'Upload bucket mismatch detected. Please retry upload.',
        status: 409,
      };
    }

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
        uploadedBy: session.user.id,
      });
    });

    await enqueueDocumentAiWorkflowsBestEffort({
      claimId,
      fileId,
      originalName,
      storagePath,
      mimeType,
      fileSize,
      resolvedBucket,
      category,
      tenantId,
      userId: session.user.id,
    });

    revalidateAdminEvidencePaths(claimId);
    return { success: true };
  } catch (error) {
    console.error('[admin/claims] confirmAdminUpload error', error);
    return { success: false, error: 'Failed to save document metadata', status: 500 };
  }
}
