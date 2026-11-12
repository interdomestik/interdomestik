import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readTenantObjectPrefix } from './object-prefix';

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
afterEach(() => vi.unstubAllGlobals());

describe('bounded storage prefix reads', () => {
  it('requests only 256 bytes through the tenant-scoped signed download helper', async () => {
    m.fetch.mockResolvedValue(
      new Response(new Uint8Array(256), {
        status: 206,
        headers: { 'content-range': 'bytes 0-255/52428800' },
      })
    );
    expect((await readTenantObjectPrefix(target)).length).toBe(256);
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

  it('does not fetch when signing fails', async () => {
    m.sign.mockResolvedValueOnce({ data: null, error: { message: 'secret' } });
    await expect(readTenantObjectPrefix(target)).rejects.toThrow('Evidence prefix unavailable');
    expect(m.fetch).not.toHaveBeenCalled();
  });
});
