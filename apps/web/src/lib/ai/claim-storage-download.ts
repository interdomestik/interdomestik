import { downloadAiStorageObjectWithRetry } from '@/lib/ai/storage-download-retry';

type ClaimStorageDownloadArgs = {
  bucket: string;
  filePath: string;
  tenantId: string;
};

const CLAIM_DOWNLOAD_ERROR = 'Failed to download queued claim document.';

export async function downloadClaimAiFileWithRetry(
  args: ClaimStorageDownloadArgs
): Promise<Buffer> {
  return downloadAiStorageObjectWithRetry({
    bucket: args.bucket,
    context: 'claim AI document download',
    failureMessage: CLAIM_DOWNLOAD_ERROR,
    family: 'claims',
    filePath: args.filePath,
    tenantId: args.tenantId,
  });
}
