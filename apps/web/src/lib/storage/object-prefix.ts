import 'server-only';
import { EVIDENCE_PREFIX_BYTES } from '@/features/claims/upload/evidence-file-policy';
import { createTenantSignedDownloadUrl, type TenantStorageTarget } from './service-role';

/** Never buffer the object: request a bounded range and refuse an unbounded response. */
export async function readTenantObjectPrefix(args: TenantStorageTarget): Promise<Uint8Array> {
  const signed = await createTenantSignedDownloadUrl({ ...args, expiresInSeconds: 60 });
  if (signed.error || !signed.data?.signedUrl) throw new Error('Evidence prefix unavailable');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const response = await fetch(signed.data.signedUrl, {
      headers: { Range: `bytes=0-${EVIDENCE_PREFIX_BYTES - 1}` },
      cache: 'no-store',
      signal: controller.signal,
    });
    const range = /^bytes 0-(\d+)\/(\d+)$/.exec(response.headers.get('content-range') ?? '');
    if (response.status !== 206 || !range || !response.body) {
      throw new Error('Evidence range unavailable');
    }
    const length = Number(range[1]) + 1;
    if (length > EVIDENCE_PREFIX_BYTES || length > Number(range[2])) {
      throw new Error('Invalid evidence range');
    }
    reader = response.body.getReader();
    const prefix = new Uint8Array(length);
    let offset = 0;
    while (offset < length) {
      const chunk = await reader.read();
      if (chunk.done || chunk.value.byteLength > length - offset) {
        throw new Error('Invalid evidence prefix');
      }
      prefix.set(chunk.value, offset);
      offset += chunk.value.byteLength;
    }
    return prefix;
  } finally {
    controller.abort();
    await reader?.cancel().catch(() => undefined);
    clearTimeout(timeout);
  }
}
