'use server';

import { auth } from '@/lib/auth';
import { enforceRateLimitForAction } from '@/lib/rate-limit';
import { ensureTenantId } from '@interdomestik/shared-auth';
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

  // 1. Auth Check (First to prevent unauthorized resource usage)
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return { success: false, error: 'Unauthorized' };
  }

  // 2. Early Size Check (Before reading buffer) - Max 10MB
  if (file.size > 10 * 1024 * 1024) {
    return { success: false, error: 'File too large (max 10MB)' };
  }

  // 3. Rate Limit (using action-safe helper)
  const rateLimit = await enforceRateLimitForAction({
    name: 'action:upload-voice',
    limit: 5,
    windowSeconds: 600,
    headers: await headers(),
  });

  if (rateLimit.limited) {
    // Preserve 503 vs 429 distinction
    if (rateLimit.status === 503) {
      return { success: false, error: 'Service unavailable. Please try again later.' };
    }
    return { success: false, error: 'Too many uploads. Please try again later.' };
  }

  // 4. Read buffer ONCE and reuse for both validation and upload
  const arrayBuffer = await file.arrayBuffer();
  const header = new Uint8Array(arrayBuffer.slice(0, 12));
  let isValidAudio = false;

  // Check for common audio signatures
  if (header[0] === 0x49 && header[1] === 0x44 && header[2] === 0x33)
    isValidAudio = true; // ID3 (MP3)
  else if (header[0] === 0x52 && header[1] === 0x49 && header[2] === 0x46 && header[3] === 0x46)
    isValidAudio = true; // RIFF (WAV)
  else if (header[0] === 0x4f && header[1] === 0x67 && header[2] === 0x67 && header[3] === 0x53)
    isValidAudio = true; // OggS
  else if (header[0] === 0x1a && header[1] === 0x45 && header[2] === 0xdf && header[3] === 0xa3)
    isValidAudio = true; // WebM (EBML)
  else if (header[0] === 0xff && (header[1] & 0xe0) === 0xe0) isValidAudio = true; // MPEG sync

  // ftyp (M4A/MP4) at offset 4
  if (!isValidAudio && arrayBuffer.byteLength >= 8) {
    const sub = new Uint8Array(arrayBuffer.slice(4, 8));
    if (sub[0] === 0x66 && sub[1] === 0x74 && sub[2] === 0x79 && sub[3] === 0x70)
      isValidAudio = true;
  }

  if (!isValidAudio) {
    return { success: false, error: 'Invalid audio file format detected.' };
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

  // Infer extension from magic bytes when file.type is missing/unknown
  function inferExtFromMagicBytes(buf: Uint8Array): string | null {
    if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) return 'mp3'; // ID3
    if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return 'mp3'; // MPEG sync
    if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) return 'wav'; // RIFF
    if (buf[0] === 0x4f && buf[1] === 0x67 && buf[2] === 0x67 && buf[3] === 0x53) return 'ogg'; // OggS
    if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return 'webm'; // EBML
    // MP4/M4A: check ftyp at offset 4
    if (buf.length >= 8) {
      if (buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) return 'mp4';
    }
    return null;
  }

  const ALLOWED_MIME_TYPES: Record<string, string> = {
    'audio/webm': 'webm',
    'audio/mp4': 'mp4',
    'audio/ogg': 'ogg',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
  };

  // Try MIME type first, then magic bytes, then filename extension
  let ext: string | undefined = ALLOWED_MIME_TYPES[file.type];
  if (!ext) {
    const inferred = inferExtFromMagicBytes(header);
    if (inferred) ext = inferred;
  }
  if (!ext) {
    // Fallback to filename extension
    const lower = file.name?.toLowerCase() ?? '';
    if (lower.endsWith('.mp3')) ext = 'mp3';
    else if (lower.endsWith('.wav')) ext = 'wav';
    else if (lower.endsWith('.ogg')) ext = 'ogg';
    else if (lower.endsWith('.webm')) ext = 'webm';
    else if (lower.endsWith('.mp4') || lower.endsWith('.m4a')) ext = 'mp4';
  }

  if (!ext) {
    return {
      success: false,
      error: 'Could not determine audio format. Allowed: webm, mp4, ogg, mp3, wav',
    };
  }
  const fileName = `pii/tenants/${tenantId}/claims/${userId}/voice-notes/${crypto.randomUUID()}.${ext}`;
  const bucketName = process.env.NEXT_PUBLIC_SUPABASE_EVIDENCE_BUCKET || 'claim-evidence';
  const signedUrlExpiresIn = 60 * 10;

  try {
    // Reuse the arrayBuffer already read for magic byte validation
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
