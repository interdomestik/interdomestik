import { downloadAiStorageObjectWithRetry } from '@/lib/ai/storage-download-retry';

type PolicyStorageDownloadArgs = {
  bucket: string;
  filePath: string;
  tenantId: string;
};

const POLICY_DOWNLOAD_ERROR = 'Failed to download queued policy document.';

export async function downloadPolicyFileWithRetry(
  args: PolicyStorageDownloadArgs
): Promise<Buffer> {
  return downloadAiStorageObjectWithRetry({
    bucket: args.bucket,
    context: 'policy analysis download',
    failureMessage: POLICY_DOWNLOAD_ERROR,
    family: 'policies',
    filePath: args.filePath,
    tenantId: args.tenantId,
  });
}
