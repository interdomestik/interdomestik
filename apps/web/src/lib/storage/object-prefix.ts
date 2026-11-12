import 'server-only';
import {
  EVIDENCE_PREFIX_BYTES,
  EVIDENCE_TAIL_BYTES,
  type EvidenceObjectTail,
} from '@/features/claims/upload/evidence-file-policy';
import { createTenantSignedDownloadUrl, type TenantStorageTarget } from './service-role';

/** Never buffer the object: request a bounded range and refuse an unbounded response. */
async function readTenantObjectRange(
  args: TenantStorageTarget,
  suffix: boolean
): Promise<EvidenceObjectTail> {
  const signed = await createTenantSignedDownloadUrl({ ...args, expiresInSeconds: 60 });
  if (signed.error || !signed.data?.signedUrl) throw new Error('Evidence prefix unavailable');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(signed.data.signedUrl, {
      headers: {
        Range: suffix ? `bytes=-${EVIDENCE_TAIL_BYTES}` : `bytes=0-${EVIDENCE_PREFIX_BYTES - 1}`,
      },
      cache: 'no-store',
      signal: controller.signal,
    });
    if (response.status !== 206 || !response.body) {
      throw new Error('Evidence range unavailable');
    }
    const { start, length } = validateRange(response.headers.get('content-range'), suffix);
    const prefix = new Uint8Array(length);
    let offset = 0;
    // Leaving the async iteration (return or throw) cancels the stream.
    for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
      if (chunk.byteLength > length - offset) throw new Error('Invalid evidence prefix');
      prefix.set(chunk, offset);
      offset += chunk.byteLength;
      if (offset === length) return { bytes: prefix, offset: start };
    }
    throw new Error('Invalid evidence prefix');
  } finally {
    controller.abort();
    clearTimeout(timeout);
  }
}

function validateRange(header: string | null, suffix: boolean): { start: number; length: number } {
  const range = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(header ?? '');
  if (!range) throw new Error('Invalid evidence range');
  const [start, end, total] = range.slice(1).map(Number);
  if (![start, end, total].every(Number.isSafeInteger) || total <= 0) {
    throw new Error('Invalid evidence range');
  }
  const limit = suffix ? EVIDENCE_TAIL_BYTES : EVIDENCE_PREFIX_BYTES;
  const expectedStart = suffix ? Math.max(0, total - limit) : 0;
  const expectedEnd = suffix ? total - 1 : Math.min(total, limit) - 1;
  if (start !== expectedStart || end !== expectedEnd) throw new Error('Invalid evidence range');
  return { start, length: end - start + 1 };
}

export async function readTenantObjectPrefix(args: TenantStorageTarget): Promise<Uint8Array> {
  return (await readTenantObjectRange(args, false)).bytes;
}

/** At most 64 KiB, ending exactly at the object boundary, for OOXML ZIP directories. */
export function readTenantObjectTail(args: TenantStorageTarget): Promise<EvidenceObjectTail> {
  return readTenantObjectRange(args, true);
}
