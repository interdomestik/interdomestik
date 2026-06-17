import { throwTransientRetryFailure, withTransientRetry } from '@/lib/reliability/transient-retry';

type StorageDownloadFamily = 'claims' | 'policies';

type AiStorageDownloadArgs = {
  bucket: string;
  context: string;
  failureMessage: string;
  family: StorageDownloadFamily;
  filePath: string;
  tenantId: string;
};

function storageDownloadError(message: string, error: unknown): Error {
  return Object.assign(new Error(message), { cause: error });
}

export async function downloadAiStorageObjectWithRetry(
  args: AiStorageDownloadArgs
): Promise<Buffer> {
  const result = await withTransientRetry(
    async () => {
      const { downloadTenantObject } = await import('@/lib/storage/service-role');
      const { data, error } = await downloadTenantObject({
        bucket: args.bucket,
        context: args.context,
        family: args.family,
        path: args.filePath,
        tenantId: args.tenantId,
      });

      if (error || !data) {
        throw storageDownloadError(args.failureMessage, error);
      }

      return Buffer.from(await data.arrayBuffer());
    },
    { initialDelayMs: 200, maxDelayMs: 1_000, maxElapsedMs: 15_000 }
  );

  if (!result.ok) {
    throwTransientRetryFailure(result, args.failureMessage);
  }

  return result.value;
}
