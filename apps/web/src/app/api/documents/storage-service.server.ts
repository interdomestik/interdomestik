import { createTenantSignedDownloadUrl, downloadTenantObject } from '@/lib/storage/service-role';

import type { DocumentAccessDeps } from './_core';

type DocumentStorageService = DocumentAccessDeps['storage'];

export function createDocumentSignedUrlStorageService(): DocumentStorageService {
  return {
    createSignedUrl: async (bucket, path, expiresIn, options) => {
      const { data, error } = await createTenantSignedDownloadUrl({
        bucket,
        context: 'document signed URL',
        expiresInSeconds: expiresIn,
        family: options.family,
        operation: 'documentDownload',
        path,
        tenantId: options.tenantId,
      });
      return { signedUrl: data?.signedUrl || undefined, error: error || undefined };
    },
    download: async () => ({}),
  };
}

export function createDocumentDownloadStorageService(): DocumentStorageService {
  return {
    createSignedUrl: async () => ({}),
    download: async (bucket, path, options) => {
      const { data, error } = await downloadTenantObject({
        bucket,
        context: 'document download',
        family: options.family,
        path,
        tenantId: options.tenantId,
      });
      return { data: data || undefined, error: error || undefined };
    },
  };
}
