import { throwTransientRetryFailure, withTransientRetry } from '@/lib/reliability/transient-retry';

type PolicyStorageDownloadArgs = {
  bucket: string;
  filePath: string;
  tenantId: string;
};

const POLICY_DOWNLOAD_ERROR = 'Failed to download queued policy document.';

function storageDownloadError(error: unknown): Error {
  return Object.assign(new Error(POLICY_DOWNLOAD_ERROR), { cause: error });
}

export async function downloadPolicyFileWithRetry(
  args: PolicyStorageDownloadArgs
): Promise<Buffer> {
  const result = await withTransientRetry(
    async () => {
      const { downloadTenantObject } = await import('@/lib/storage/service-role');
      const { data, error } = await downloadTenantObject({
        bucket: args.bucket,
        context: 'policy analysis download',
        family: 'policies',
        path: args.filePath,
        tenantId: args.tenantId,
      });

      if (error || !data) {
        throw storageDownloadError(error);
      }

      return Buffer.from(await data.arrayBuffer());
    },
    { initialDelayMs: 200, maxDelayMs: 1_000, maxElapsedMs: 15_000 }
  );

  if (!result.ok) {
    throwTransientRetryFailure(result, POLICY_DOWNLOAD_ERROR);
  }

  return result.value;
}
