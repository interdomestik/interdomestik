import { validateEvidenceFile } from '../evidence-file-policy';

export type UploadRefusal = { success: false; error: string; status: 400 | 413 };

// The approved format, its size limit and a storage content type equal to its canonical MIME.
export function refuseUnapprovedUpload(args: {
  fileName: string;
  fileSize: number;
  mimeType: string;
  storageContentType?: string;
}): UploadRefusal | null {
  const { fileName, fileSize, mimeType, storageContentType } = args;
  const validation = validateEvidenceFile(fileName, fileSize, mimeType);
  if (!validation.success) {
    return {
      success: false,
      error: validation.error,
      status: validation.error === 'evidence_too_large' ? 413 : 400,
    };
  }
  if (validation.format.mimeType !== mimeType || (storageContentType ?? mimeType) !== mimeType) {
    return { success: false, error: 'evidence_unsupported', status: 400 };
  }
  return null;
}
