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

  // 1. Auth Check
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return { success: false, error: 'Unauthorized' };
  }

  // 2. Early Size Check
  if (file.size > 10 * 1024 * 1024) {
    return { success: false, error: 'File too large (max 10MB)' };
  }

  // 3. Rate Limit
  const rateLimit = await enforceRateLimitForAction({
    name: 'action:upload-voice',
    limit: 5,
    windowSeconds: 600,
    headers: await headers(),
  });

  if (rateLimit.limited) {
    if (rateLimit.status === 503) {
      return { success: false, error: 'Service unavailable. Please try again later.' };
    }
    return { success: false, error: 'Too many uploads. Please try again later.' };
  }

  // 4. File Type Validation
  const arrayBuffer = await file.arrayBuffer();
  const buffer = new Uint8Array(arrayBuffer); // Full buffer for inference
  const ext = determineFileExtension(file, buffer);

  if (!ext) {
    return {
      success: false,
      error: 'Could not determine audio format. Allowed: webm, mp4, ogg, mp3, wav',
    };
  }

  // 5. Upload Logic
  return await uploadToStorage({
    buffer: Buffer.from(arrayBuffer),
    ext,
    userId: session.user.id,
    tenantId: ensureTenantId(session),
  });
}

function determineFileExtension(file: File, buffer: Uint8Array): string | null {
  const ALLOWED_MIME_TYPES: Record<string, string> = {
    'audio/webm': 'webm',
    'audio/mp4': 'mp4',
    'audio/ogg': 'ogg',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
  };

  // Try MIME type first
  const mimeExt = ALLOWED_MIME_TYPES[file.type];
  if (mimeExt) return mimeExt;

  // Try Magic Bytes
  const magicExt = inferExtFromMagicBytes(buffer);
  if (magicExt) return magicExt;

  // Fallback to filename extension
  const lower = file.name?.toLowerCase() ?? '';
  if (lower.endsWith('.mp3')) return 'mp3';
  if (lower.endsWith('.wav')) return 'wav';
  if (lower.endsWith('.ogg')) return 'ogg';
  if (lower.endsWith('.webm')) return 'webm';
  if (lower.endsWith('.mp4') || lower.endsWith('.m4a')) return 'mp4';

  return null;
}

function inferExtFromMagicBytes(buf: Uint8Array): string | null {
  if (buf.length < 4) return null;

  // ID3 (MP3)
  if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) return 'mp3';
  // MPEG sync (MP3)
  if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return 'mp3';
  // RIFF (WAV)
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) return 'wav';
  // OggS
  if (buf[0] === 0x4f && buf[1] === 0x67 && buf[2] === 0x67 && buf[3] === 0x53) return 'ogg';
  // WebM (EBML)
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return 'webm';

  // MP4/M4A: check ftyp at offset 4
  if (buf.length >= 8) {
    if (buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) return 'mp4';
  }
  return null;
}

async function uploadToStorage(params: {
  buffer: Buffer;
  ext: string;
  userId: string;
  tenantId: string;
}): Promise<UploadResult> {
  const { buffer, ext, userId, tenantId } = params;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Supabase service role key is required for voice note uploads.');
    return { success: false, error: 'Upload unavailable. Please try again later.' };
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const fileName = `pii/tenants/${tenantId}/claims/${userId}/voice-notes/${crypto.randomUUID()}.${ext}`;
  const bucketName = process.env.NEXT_PUBLIC_SUPABASE_EVIDENCE_BUCKET || 'claim-evidence';

  const EXT_TO_MIME: Record<string, string> = {
    webm: 'audio/webm',
    mp4: 'audio/mp4',
    ogg: 'audio/ogg',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
  };

  try {
    const { error } = await supabase.storage.from(bucketName).upload(fileName, buffer, {
      contentType: EXT_TO_MIME[ext] || 'application/octet-stream',
      upsert: false,
    });

    if (error) {
      console.error('Supabase upload error:', error);
      return { success: false, error: 'Upload failed: ' + error.message };
    }

    const { data: signedData, error: signedError } = await supabase.storage
      .from(bucketName)
      .createSignedUrl(fileName, 60 * 10);

    if (signedError || !signedData?.signedUrl) {
      return { success: true, url: '', path: fileName };
    }

    return { success: true, url: signedData.signedUrl, path: fileName };
  } catch (err) {
    console.error('Unexpected upload error:', err);
    return { success: false, error: 'Unexpected error during upload' };
  }
}
