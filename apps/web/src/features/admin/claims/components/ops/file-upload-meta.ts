import { resolveEvidenceFormat } from '@/features/claims/upload/evidence-file-policy';
export { EVIDENCE_FILE_ACCEPT } from '@/features/claims/upload/evidence-file-policy';

export function resolveUploadMimeType(file: File): string {
  return resolveEvidenceFormat(file.name, file.type)?.mimeType ?? '';
}

export function resolveStorageUploadContentType(file: File): string {
  return resolveUploadMimeType(file);
}
