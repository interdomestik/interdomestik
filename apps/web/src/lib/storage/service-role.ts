import 'server-only';

import { createAdminClient } from '@interdomestik/database';

import {
  type TenantStorageFamily,
  assertTenantStoragePath,
  splitStorageFolderAndName,
} from './tenant-prefix';

export const SIGNED_DOWNLOAD_TTL_SECONDS = 5 * 60;
export const VOICE_NOTE_PREVIEW_TTL_SECONDS = 10 * 60;
export const SIGNED_UPLOAD_INTENT_TTL_SECONDS = 15 * 60;

type TenantStorageTarget = {
  bucket: string;
  context?: string;
  family: TenantStorageFamily;
  path: string;
  tenantId: string;
};

type UploadTarget = TenantStorageTarget & {
  body: ArrayBuffer | ArrayBufferView | Blob | Buffer | File | FormData | NodeJS.ReadableStream;
  contentType: string;
  upsert?: boolean;
};

export async function createTenantSignedUploadUrl(
  args: TenantStorageTarget & { upsert?: boolean }
) {
  assertTenantStoragePath(args);

  return createAdminClient()
    .storage.from(args.bucket)
    .createSignedUploadUrl(args.path, { upsert: args.upsert ?? true });
}

export async function createTenantSignedDownloadUrl(
  args: TenantStorageTarget & { expiresInSeconds?: number }
) {
  assertTenantStoragePath(args);

  return createAdminClient()
    .storage.from(args.bucket)
    .createSignedUrl(args.path, args.expiresInSeconds ?? SIGNED_DOWNLOAD_TTL_SECONDS);
}

export async function uploadTenantObject(args: UploadTarget) {
  assertTenantStoragePath(args);

  return createAdminClient()
    .storage.from(args.bucket)
    .upload(args.path, args.body, {
      contentType: args.contentType,
      upsert: args.upsert ?? false,
    });
}

export async function downloadTenantObject(args: TenantStorageTarget) {
  assertTenantStoragePath(args);

  return createAdminClient().storage.from(args.bucket).download(args.path);
}

export async function listTenantObjectsForSingleFile(args: TenantStorageTarget) {
  assertTenantStoragePath(args);
  const { fileName, folder } = splitStorageFolderAndName(args.path);

  return createAdminClient().storage.from(args.bucket).list(folder, {
    limit: 100,
    search: fileName,
  });
}
