'use server';

import { auth } from '@/lib/auth';
import { resolveEvidenceBucketName } from '@/lib/storage/evidence-bucket';
import { claimDocuments, claims, db } from '@interdomestik/database';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';

export type GenerateUploadUrlResult =
  | { success: true; url: string; path: string; id: string; token: string; bucket: string }
  | { success: false; error: string; status: 401 | 404 | 413 | 500 };

export async function generateUploadUrl(
  claimId: string,
  fileName: string,
  contentType: string,
  fileSize: number
): Promise<GenerateUploadUrlResult> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return { success: false, error: 'Unauthorized', status: 401 };
  }

  const tenantId = ensureTenantId(session);
  let evidenceBucket: string;
  try {
    evidenceBucket = resolveEvidenceBucketName();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upload bucket configuration error';
    console.error('[member/claims] Bucket configuration error', {
      message,
      nodeEnv: process.env.NODE_ENV,
      vercelEnv: process.env.VERCEL_ENV,
    });
    return { success: false, error: message, status: 500 };
  }

  // Authorization: fail-closed to claims owned by the current member and tenant.
  const claim = await db.query.claims.findFirst({
    where: and(
      eq(claims.id, claimId),
      eq(claims.tenantId, tenantId),
      eq(claims.userId, session.user.id)
    ),
  });

  if (!claim) {
    return { success: false, error: 'Claim not found', status: 404 };
  }

  // Validation
  if (fileSize > 50 * 1024 * 1024) {
    return { success: false, error: 'File too large (max 50MB)', status: 413 };
  }

  // Path: pii/tenants/{tenantId}/claims/{claimId}/{uuid}.{ext}
  const ext = fileName.split('.').pop() || 'bin';
  const fileId = randomUUID();
  const path = `pii/tenants/${tenantId}/claims/${claimId}/${fileId}.${ext}`;

  // Supabase
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase configuration');
    return { success: false, error: 'Configuration error', status: 500 };
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { data, error } = await supabase.storage
      .from(evidenceBucket)
      .createSignedUploadUrl(path, { upsert: true });

    if (error || !data?.signedUrl || !data?.token) {
      const detail = error?.message ?? 'Unknown storage error';
      console.error('Supabase signed URL error:', {
        bucket: evidenceBucket,
        path,
        detail,
        error,
      });
      return { success: false, error: `Failed to generate upload URL: ${detail}`, status: 500 };
    }

    return {
      success: true,
      url: data.signedUrl,
      path: path,
      id: fileId,
      token: data.token,
      bucket: evidenceBucket,
    };
  } catch (err) {
    console.error('generateUploadUrl error:', err);
    return { success: false, error: 'Unexpected error', status: 500 };
  }
}

export type ConfirmUploadResult =
  | { success: true }
  | { success: false; error: string; status: 401 | 404 | 409 | 500 };

export async function confirmUpload(
  claimId: string,
  storagePath: string,
  originalName: string,
  mimeType: string,
  fileSize: number,
  fileId: string, // The pre-generated ID
  uploadedBucket?: string
): Promise<ConfirmUploadResult> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return { success: false, error: 'Unauthorized', status: 401 };
  }

  const tenantId = ensureTenantId(session);
  let resolvedBucket: string;
  try {
    resolvedBucket = resolveEvidenceBucketName();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upload bucket configuration error';
    console.error('[member/claims] Bucket configuration error', {
      message,
      nodeEnv: process.env.NODE_ENV,
      vercelEnv: process.env.VERCEL_ENV,
    });
    return { success: false, error: message, status: 500 };
  }

  // Authorization: fail-closed to claims owned by the current member and tenant.
  const claim = await db.query.claims.findFirst({
    where: and(
      eq(claims.id, claimId),
      eq(claims.tenantId, tenantId),
      eq(claims.userId, session.user.id)
    ),
  });

  if (!claim) {
    return { success: false, error: 'Claim not found', status: 404 };
  }

  try {
    if (uploadedBucket && uploadedBucket !== resolvedBucket) {
      console.error('[member/claims] confirmUpload bucket mismatch', {
        uploadedBucket,
        resolvedBucket,
      });
      return {
        success: false,
        error: 'Upload bucket mismatch detected. Please retry upload.',
        status: 409,
      };
    }

    await db.insert(claimDocuments).values({
      id: fileId,
      tenantId: tenantId,
      claimId,
      name: originalName,
      filePath: storagePath,
      fileType: mimeType,
      fileSize,
      bucket: resolvedBucket,
      category: 'evidence',
      uploadedBy: session.user.id,
    });

    revalidatePath(`/[locale]/(app)/member/claims/${claimId}`);
    return { success: true };
  } catch (err) {
    console.error('confirmUpload error:', err);
    return { success: false, error: 'Failed to save document metadata', status: 500 };
  }
}
