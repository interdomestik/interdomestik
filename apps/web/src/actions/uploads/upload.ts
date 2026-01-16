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

// S3 / MinIO Support
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

async function uploadToStorage(params: {
  buffer: Buffer;
  ext: string;
  userId: string;
  tenantId: string;
}): Promise<UploadResult> {
  const { buffer, ext, userId, tenantId } = params;

  // 1. MinIO / S3 Path (Docker / Local)
  if (process.env.S3_ENDPOINT) {
    try {
      const s3 = new S3Client({
        region: process.env.S3_REGION || 'us-east-1',
        endpoint: process.env.S3_ENDPOINT,
        forcePathStyle: true, // Required for MinIO
        credentials: {
          accessKeyId: process.env.S3_ACCESS_KEY || 'minioadmin',
          secretAccessKey: process.env.S3_SECRET_KEY || 'minioadmin',
        },
      });

      const bucketName = process.env.S3_BUCKET_NAME || 'claim-evidence';
      const fileName = `pii/tenants/${tenantId}/claims/${userId}/voice-notes/${crypto.randomUUID()}.${ext}`;
      const contentType =
        {
          webm: 'audio/webm',
          mp4: 'audio/mp4',
          ogg: 'audio/ogg',
          mp3: 'audio/mpeg',
          wav: 'audio/wav',
        }[ext] || 'application/octet-stream';

      // Upload
      await s3.send(
        new PutObjectCommand({
          Bucket: bucketName,
          Key: fileName,
          Body: buffer,
          ContentType: contentType,
        })
      );

      // Sign URL
      // Note: In Docker, S3_ENDPOINT is internal (minio:9000).
      // For the browser to access it, we likely need a public URL (localhost:9000).
      // Ideally S3_PUBLIC_URL is set to http://localhost:9000
      const publicEndpoint = process.env.S3_PUBLIC_URL || process.env.S3_ENDPOINT;

      // Signing with S3Client connected to internal endpoint usually produces internal URL.
      // We might need to construct it manually or configure a separate client for signing if endpoint differs.
      // For simplicity in this stack, we assume direct access or mapped ports.
      // Actually, pre-signed URLs embed the host. If host is "minio", browser fails.
      // Workaround: We use a separate "signer" client configured with localhost if running locally.

      const signer = new S3Client({
        region: process.env.S3_REGION || 'us-east-1',
        endpoint: process.env.S3_PUBLIC_URL || 'http://localhost:9000',
        forcePathStyle: true,
        credentials: {
          accessKeyId: process.env.S3_ACCESS_KEY || 'minioadmin',
          secretAccessKey: process.env.S3_SECRET_KEY || 'minioadmin',
        },
      });

      const command = new PutObjectCommand({ Bucket: bucketName, Key: fileName });
      const signedUrl = await getSignedUrl(signer, command, { expiresIn: 60 * 10 }); // Not PutObject, we need GetObject for viewing?
      // Wait, uploadToStorage returns success and URL. Is the URL for viewing or just confirming?
      // "url: signedData.signedUrl" implies returnable view URL.
      // But we just uploaded it.
      // The original code does `createSignedUrl` which corresponds to GET access.

      const getCommand = new GetObjectCommand({
        Bucket: bucketName,
        Key: fileName,
      });
      const viewUrl = await getSignedUrl(signer, getCommand, { expiresIn: 60 * 10 });

      return { success: true, url: viewUrl, path: fileName };
    } catch (err) {
      console.error('S3/MinIO upload error:', err);
      return { success: false, error: 'Upload failed (S3)' };
    }
  }

  // 2. Supabase Storage (Default)
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
