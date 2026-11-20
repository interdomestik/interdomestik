import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readTenantObjectPrefix, readTenantObjectTail } from './object-prefix';

const m = vi.hoisted(() => ({ sign: vi.fn(), fetch: vi.fn() }));
vi.mock('./service-role', () => ({ createTenantSignedDownloadUrl: m.sign }));

const target = {
  bucket: 'claim-evidence',
  family: 'claims' as const,
  tenantId: 'tenant-1',
  path: 'pii/tenants/tenant-1/claims/claim-1/file-1.pdf',
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('fetch', m.fetch);
  m.sign.mockResolvedValue({ data: { signedUrl: 'https://storage.test/signed' }, error: null });
});

describe('bounded OOXML storage tail reads', () => {
  it.each([100, 65536, 100000])('reads exactly the final min(64 KiB, %s) bytes', async total => {
    const start = Math.max(0, total - 65536);
    const bytes = new Uint8Array(total - start).fill(7);
    m.fetch.mockResolvedValue(
      new Response(bytes, {
        status: 206,
        headers: { 'content-range': `bytes ${start}-${total - 1}/${total}` },
      })
    );
    expect(await readTenantObjectTail(target)).toEqual({ bytes, offset: start });
    expect(m.sign).toHaveBeenCalledWith({ ...target, expiresInSeconds: 60 });
    expect(m.fetch.mock.calls[0][1].headers).toEqual({ Range: 'bytes=-65536' });
    expect(m.fetch.mock.calls[0][1].signal.aborted).toBe(true);
  });

  it.each([
    [200, null],
    [206, null],
    [206, 'bytes 0-65536/65537'],
    [206, 'bytes 0-255/100000'],
    [206, 'bytes 34464-99998/100000'],
    [206, 'bytes 34465-99999/100000'],
    [206, 'bytes 0-9007199254740992/9007199254740993'],
    [206, 'bytes 0-0/0'],
  ])('refuses unbounded or incorrect suffix responses: %s / %s', async (status, range) => {
    const read = vi.fn();
    m.fetch.mockResolvedValue({
      status,
      headers: new Headers(range ? { 'content-range': range } : {}),
      body: { getReader: read },
    });
    await expect(readTenantObjectTail(target)).rejects.toThrow();
    expect(read).not.toHaveBeenCalled();
    expect(m.fetch.mock.calls[0][1].signal.aborted).toBe(true);
  });

  it.each([10, 65537])('refuses a suffix body with incorrect length %s', async length => {
    m.fetch.mockResolvedValue(
      new Response(new Uint8Array(length), {
        status: 206,
        headers: { 'content-range': 'bytes 34464-99999/100000' },
      })
    );
    await expect(readTenantObjectTail(target)).rejects.toThrow();
  });

  it('cancels the suffix stream as soon as the byte cap is exceeded', async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(65537));
      },
      cancel,
    });
    m.fetch.mockResolvedValue(
      new Response(stream, {
        status: 206,
        headers: { 'content-range': 'bytes 34464-99999/100000' },
      })
    );
    await expect(readTenantObjectTail(target)).rejects.toThrow();
    expect(cancel).toHaveBeenCalledOnce();
    expect(stream.locked).toBe(false);
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('bounded storage prefix reads', () => {
  it('requests only 256 bytes through the tenant-scoped signed download helper', async () => {
    m.fetch.mockResolvedValue(
      new Response(new Uint8Array(256), {
        status: 206,
        headers: { 'content-range': 'bytes 0-255/52428800' },
      })
    );
    expect(await readTenantObjectPrefix(target)).toHaveLength(256);
    expect(m.sign).toHaveBeenCalledWith({ ...target, expiresInSeconds: 60 });
    expect(m.fetch).toHaveBeenCalledWith(
      'https://storage.test/signed',
      expect.objectContaining({
        headers: { Range: 'bytes=0-255' },
        cache: 'no-store',
        signal: expect.any(AbortSignal),
      })
    );
    expect(m.fetch.mock.calls[0][1].signal.aborted).toBe(true);
  });

  it('supports files shorter than the range', async () => {
    m.fetch.mockResolvedValue(
      new Response(new TextEncoder().encode('%PDF-'), {
        status: 206,
        headers: { 'content-range': 'bytes 0-4/5' },
      })
    );
    expect(new TextDecoder().decode(await readTenantObjectPrefix(target))).toBe('%PDF-');
  });

  it.each([
    [200, null],
    [500, null],
    [206, null],
    [206, 'bytes 0-999/1000'],
    [206, 'bytes 20-30/100'],
    [206, 'bytes 0-255/5'],
  ])('refuses status %s / range %s without reading the body', async (status, range) => {
    const reader = vi.fn();
    m.fetch.mockResolvedValue({
      status,
      headers: new Headers(range ? { 'content-range': range } : {}),
      body: { getReader: reader },
    });
    await expect(readTenantObjectPrefix(target)).rejects.toThrow();
    expect(reader).not.toHaveBeenCalled();
    expect(m.fetch.mock.calls[0][1].signal.aborted).toBe(true);
  });

  it('refuses truncated and oversized response bodies', async () => {
    for (const length of [1, 257]) {
      m.fetch.mockResolvedValueOnce(
        new Response(new Uint8Array(length), {
          status: 206,
          headers: { 'content-range': 'bytes 0-255/1000' },
        })
      );
      await expect(readTenantObjectPrefix(target)).rejects.toThrow();
    }
  });

  it('assembles a prefix delivered in several chunks', async () => {
    const chunks = [new Uint8Array(100).fill(1), new Uint8Array(156).fill(2)];
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        const next = chunks.shift();
        if (next) controller.enqueue(next);
        else controller.close();
      },
    });
    m.fetch.mockResolvedValue(
      new Response(body, { status: 206, headers: { 'content-range': 'bytes 0-255/1000' } })
    );
    const prefix = await readTenantObjectPrefix(target);
    expect(prefix).toHaveLength(256);
    expect([prefix[99], prefix[100]]).toEqual([1, 2]);
  });

  it('does not fetch when signing fails', async () => {
    m.sign.mockResolvedValueOnce({ data: null, error: { message: 'secret' } });
    await expect(readTenantObjectPrefix(target)).rejects.toThrow('Evidence prefix unavailable');
    expect(m.fetch).not.toHaveBeenCalled();
  });
});
