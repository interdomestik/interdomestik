import type { ConfirmedUploadValidationResult } from './claim-upload-intent';

function numberFromMetadata(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function stringFromMetadata(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function getObjectMetadataValue(metadata: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (metadata[key] !== undefined) return metadata[key];
  }

  return undefined;
}

export async function validateStoredObject(params: {
  bucket: string;
  fileSize: number;
  logPrefix: string;
  mimeType: string;
  storagePath: string;
  tenantId: string;
}): Promise<ConfirmedUploadValidationResult> {
  const { bucket, fileSize, logPrefix, mimeType, storagePath, tenantId } = params;
  const lastSlashIndex = storagePath.lastIndexOf('/');
  const fileName = storagePath.slice(lastSlashIndex + 1);

  const { listTenantObjectsForSingleFile, usesDeterministicE2EStorage } =
    await import('@/lib/storage/service-role');
  if (usesDeterministicE2EStorage()) {
    return { success: true };
  }

  const { data, error } = await listTenantObjectsForSingleFile({
    bucket,
    context: 'claim upload verification',
    family: 'claims',
    path: storagePath,
    tenantId,
  });

  if (error) {
    console.error(`${logPrefix} storage object verification failed`, {
      bucket,
      storagePath,
      detail: error.message,
    });
    return { success: false, error: 'Failed to verify uploaded file', status: 500 };
  }

  const storedObject = data?.find(object => object.name === fileName);
  if (!storedObject) {
    return {
      success: false,
      error: 'Uploaded file was not found. Please retry upload.',
      status: 409,
    };
  }

  const metadata = (storedObject.metadata ?? {}) as Record<string, unknown>;
  const storedSize = numberFromMetadata(
    getObjectMetadataValue(metadata, ['size', 'contentLength', 'content_length'])
  );
  const storedMimeType = stringFromMetadata(
    getObjectMetadataValue(metadata, ['mimetype', 'mimeType', 'contentType', 'content_type'])
  );

  if (storedSize !== fileSize || storedMimeType !== mimeType) {
    return {
      success: false,
      error: 'Uploaded file metadata mismatch. Please retry upload.',
      status: 409,
    };
  }

  return { success: true };
}
