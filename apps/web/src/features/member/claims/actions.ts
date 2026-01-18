'use server';

import { auth } from '@/lib/auth';
import { db, documents } from '@interdomestik/database';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';

const EVIDENCE_BUCKET = process.env.NEXT_PUBLIC_SUPABASE_EVIDENCE_BUCKET || 'claim-evidence';

export type GenerateUploadUrlResult =
  | { success: true; url: string; path: string; id: string }
  | { success: false; error: string };

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
    return { success: false, error: 'Unauthorized' };
  }

  const tenantId = ensureTenantId(session);

  // Validation
  if (fileSize > 50 * 1024 * 1024) {
    return { success: false, error: 'File too large (max 50MB)' };
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
    return { success: false, error: 'Configuration error' };
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { data, error } = await supabase.storage
      .from(EVIDENCE_BUCKET)
      .createSignedUploadUrl(path);

    if (error || !data?.signedUrl) {
      console.error('Supabase signed URL error:', error);
      return { success: false, error: 'Failed to generate upload URL' };
    }

    return {
      success: true,
      url: data.signedUrl,
      path: path,
      id: fileId,
    };
  } catch (err) {
    console.error('generateUploadUrl error:', err);
    return { success: false, error: 'Unexpected error' };
  }
}

export type ConfirmUploadResult = { success: true } | { success: false; error: string };

export async function confirmUpload(
  claimId: string,
  storagePath: string,
  originalName: string,
  mimeType: string,
  fileSize: number,
  fileId: string // The pre-generated ID
): Promise<ConfirmUploadResult> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return { success: false, error: 'Unauthorized' };
  }

  const tenantId = ensureTenantId(session);

  try {
    await db.insert(documents).values({
      id: fileId,
      tenantId: tenantId,
      entityType: 'claim',
      entityId: claimId,
      fileName: originalName,
      mimeType: mimeType,
      fileSize: fileSize,
      storagePath: storagePath,
      category: 'evidence',
      uploadedBy: session.user.id,
    });

    revalidatePath(`/[locale]/(app)/member/claims/${claimId}`);
    return { success: true };
  } catch (err) {
    console.error('confirmUpload error:', err);
    return { success: false, error: 'Failed to save document metadata' };
  }
}
