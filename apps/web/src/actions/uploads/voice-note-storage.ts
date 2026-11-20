import type { UploadResult } from './upload';
import {
  VOICE_NOTE_PREVIEW_TTL_SECONDS,
  createTenantSignedDownloadUrl,
  uploadTenantObject,
} from '@/lib/storage/service-role';
import { redactSignedUrlErrorDetails } from '@/lib/storage/signed-url-exposure';
import { createInitialClaimUploadIntentToken } from '@/features/claims/upload/server/initial-claim-upload';
import {
  assertEvidenceStoragePath,
  buildEvidenceStoragePath,
} from '@/features/claims/upload/server/storage-path';
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

type VoiceNoteInput = {
  buffer: Buffer;
  ext: string;
  contentType: string;
  userId: string;
  tenantId: string;
};
type VoiceNoteTarget = VoiceNoteInput & {
  bucket: string;
  path: string;
  fileId: string;
  intentToken: string;
};

function createVoiceNoteTarget(params: VoiceNoteInput): VoiceNoteTarget {
  const fileId = crypto.randomUUID();
  const bucket = process.env.S3_ENDPOINT
    ? process.env.S3_BUCKET_NAME || 'claim-evidence'
    : process.env.NEXT_PUBLIC_SUPABASE_EVIDENCE_BUCKET || 'claim-evidence';
  const path = buildEvidenceStoragePath({
    actorId: params.userId,
    bucket,
    expectedBucket: bucket,
    fileId,
    fileName: `voicenote.${params.ext}`,
    shape: 'initial',
    tenantId: params.tenantId,
  });
  assertEvidenceStoragePath({
    actorId: params.userId,
    bucket,
    expectedBucket: bucket,
    fileId,
    shape: 'initial',
    storagePath: path,
    tenantId: params.tenantId,
  });
  const intentToken = createInitialClaimUploadIntentToken({
    actorId: params.userId,
    bucket,
    fileId,
    fileSize: params.buffer.byteLength,
    mimeType: params.contentType,
    storagePath: path,
    tenantId: params.tenantId,
  });
  return { ...params, bucket, path, fileId, intentToken };
}

function uploadedVoiceNote(target: VoiceNoteTarget, url: string): UploadResult {
  return {
    success: true,
    url,
    path: target.path,
    id: target.fileId,
    bucket: target.bucket,
    intentToken: target.intentToken,
    mimeType: target.contentType,
    size: target.buffer.byteLength,
  };
}

function s3Configuration(endpoint: string | undefined): S3ClientConfig {
  return {
    region: process.env.S3_REGION || 'us-east-1',
    endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY || 'minioadmin',
      secretAccessKey: process.env.S3_SECRET_KEY || 'minioadmin',
    },
  };
}

async function uploadVoiceNoteToS3(target: VoiceNoteTarget): Promise<UploadResult> {
  const s3 = new S3Client(s3Configuration(process.env.S3_ENDPOINT));
  await s3.send(
    new PutObjectCommand({
      Bucket: target.bucket,
      Key: target.path,
      Body: target.buffer,
      ContentType: target.contentType,
      IfNoneMatch: '*',
    })
  );
  // Preview URLs must use the browser-accessible endpoint, which can differ from the upload host.
  const signer = new S3Client(
    s3Configuration(process.env.S3_PUBLIC_URL || 'http://localhost:9000')
  );
  const url = await getSignedUrl(
    signer,
    new GetObjectCommand({ Bucket: target.bucket, Key: target.path }),
    {
      expiresIn: VOICE_NOTE_PREVIEW_TTL_SECONDS,
    }
  );
  return uploadedVoiceNote(target, url);
}

async function uploadVoiceNoteToSupabase(target: VoiceNoteTarget): Promise<UploadResult> {
  const storage = {
    bucket: target.bucket,
    family: 'claims' as const,
    path: target.path,
    tenantId: target.tenantId,
  };
  const { error } = await uploadTenantObject({
    ...storage,
    body: target.buffer,
    contentType: target.contentType,
    context: 'voice note upload',
    upsert: false,
  });
  if (error) {
    const details = redactSignedUrlErrorDetails(error);
    console.error('Supabase upload error:', details);
    return { success: false, error: 'Upload failed: ' + details.message };
  }
  const { data, error: previewError } = await createTenantSignedDownloadUrl({
    ...storage,
    context: 'voice note preview',
    expiresInSeconds: VOICE_NOTE_PREVIEW_TTL_SECONDS,
    operation: 'voiceNotePreview',
  });
  return uploadedVoiceNote(target, previewError ? '' : (data?.signedUrl ?? ''));
}

export async function uploadToStorage(params: VoiceNoteInput): Promise<UploadResult> {
  let target: VoiceNoteTarget;
  try {
    target = createVoiceNoteTarget(params);
  } catch (error) {
    console.error('Voice note upload intent creation failed:', redactSignedUrlErrorDetails(error));
    return { success: false, error: 'Upload unavailable. Please try again later.' };
  }
  try {
    if (process.env.S3_ENDPOINT) return await uploadVoiceNoteToS3(target);
    return await uploadVoiceNoteToSupabase(target);
  } catch (error) {
    console.error('Unexpected upload error:', redactSignedUrlErrorDetails(error));
    return { success: false, error: 'Unexpected error during upload' };
  }
}
