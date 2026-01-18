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
  | { success: true; url: string; token: string; path: string; id: string }
  | { success: false; error: string };

export async function generateUploadUrl(
  entityType: 'claim' | 'member',
  entityId: string,
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
  const user = session.user;

  // Basic validation
  if (fileSize > 50 * 1024 * 1024) {
    // 50MB limit
    return { success: false, error: 'File too large (max 50MB)' };
  }

  // Generate storage path
  const ext = fileName.split('.').pop() || 'bin';
  const fileId = randomUUID();
  // Structure: pii/tenants/{tenantId}/{entityType}s/{entityId}/{fileId}.{ext}
  const path = `pii/tenants/${tenantId}/${entityType}s/${entityId}/${fileId}.${ext}`;

  // Supabase Service Client for signing
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
      token: data.token,
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
  id: string, // The generated file UUID from previous step
  entityType: 'claim' | 'member',
  entityId: string,
  fileName: string,
  contentType: string,
  fileSize: number,
  storagePath: string
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
      id: id, // Reuse the ID generated in step 1
      tenantId: tenantId,
      entityType: entityType,
      entityId: entityId,
      fileName: fileName,
      mimeType: contentType,
      fileSize: fileSize,
      storagePath: storagePath,
      category: 'evidence', // Default for now
      uploadedBy: session.user.id,
    });

    // Revalidate relevant paths
    if (entityType === 'claim') {
      revalidatePath(`/[locale]/(app)/member/claims/${entityId}`);
      revalidatePath(`/[locale]/(app)/member/claims/${entityId}`, 'page');
    } else if (entityType === 'member') {
      revalidatePath(`/[locale]/(app)/member/membership`);
    }

    return { success: true };
  } catch (err) {
    console.error('confirmUpload error:', err);
    return { success: false, error: 'Failed to save document metadata' };
  }
}
