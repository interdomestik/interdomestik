'use server';

import { auth } from '@/lib/auth';
import { enforceRateLimit } from '@/lib/rate-limit';
import { ensureTenantId } from '@interdomestik/domain-users';
import { createClient } from '@supabase/supabase-js';
import { headers } from 'next/headers';

export type UploadResult =
  | { success: true; url: string; path: string }
  | { success: false; error: string };

export async function uploadVoiceNote(formData: FormData): Promise<UploadResult> {
  const file = formData.get('file') as File;

  if (!file) {
    return { success: false, error: 'No file provided' };
  }

  // Rate Limit: 5 uploads per 10 minutes per IP
  const rateLimit = await enforceRateLimit({
    name: 'action:upload-voice',
    limit: 5,
    windowSeconds: 600,
    headers: await headers(),
  });

  if (rateLimit) {
    return { success: false, error: 'Too many uploads. Please try again later.' };
  }

  // Validate file type
  if (!file.type.startsWith('audio/')) {
    return { success: false, error: 'Invalid file type' };
  }

  // Max size 10MB
  if (file.size > 10 * 1024 * 1024) {
    return { success: false, error: 'File too large (max 10MB)' };
  }

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return { success: false, error: 'Unauthorized' };
  }

  // Use Service Role to bypass RLS since we handle auth here
  // Note: Ensure SUPABASE_SERVICE_ROLE_KEY is in .env or .env.local
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Supabase service role key is required for voice note uploads.');
    return { success: false, error: 'Upload unavailable. Please try again later.' };
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const userId = session.user.id;
  const tenantId = ensureTenantId(session);
  const ext = file.type.split('/')[1] || 'webm';
  const fileName = `pii/tenants/${tenantId}/claims/${userId}/voice-notes/${crypto.randomUUID()}.${ext}`;
  const bucketName = process.env.NEXT_PUBLIC_SUPABASE_EVIDENCE_BUCKET || 'claim-evidence';
  const signedUrlExpiresIn = 60 * 10;

  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { error } = await supabase.storage.from(bucketName).upload(fileName, buffer, {
      contentType: file.type,
      upsert: false,
    });

    if (error) {
      console.error('Supabase upload error:', error);
      return { success: false, error: 'Upload failed: ' + error.message };
    }

    const { data: signedData, error: signedError } = await supabase.storage
      .from(bucketName)
      .createSignedUrl(fileName, signedUrlExpiresIn);

    if (signedError || !signedData?.signedUrl) {
      console.warn('Signed URL generation failed for voice note upload.');
      return { success: true, url: '', path: fileName };
    }

    return { success: true, url: signedData.signedUrl, path: fileName };
  } catch (err) {
    console.error('Unexpected upload error:', err);
    return { success: false, error: 'Unexpected error during upload' };
  }
}
