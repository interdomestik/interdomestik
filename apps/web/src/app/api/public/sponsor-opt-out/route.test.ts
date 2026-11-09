import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DELETE, GET, HEAD, OPTIONS, PATCH, POST, PUT } from './route';

const mocks = vi.hoisted(() => ({ optOut: vi.fn(), rateLimit: vi.fn() }));
vi.mock('@interdomestik/domain-membership-billing/sponsors/opt-out', () => ({
  optOutByToken: mocks.optOut,
}));
vi.mock('@/lib/rate-limit', () => ({ enforceRateLimit: mocks.rateLimit }));
const token = 'a'.repeat(43);
const post = (body: unknown): Promise<Response> =>
  POST(
    new Request('http://localhost/api/public/sponsor-opt-out', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    })
  );

describe('public sponsor opt-out POST', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.rateLimit.mockResolvedValue(null);
  });

  it.each([0, 1, 9])('hides revoked count %i on success', async revoked => {
    mocks.optOut.mockResolvedValue({ ok: true, revoked });
    const response = await post({ token });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(mocks.optOut).toHaveBeenCalledWith(token, expect.any(Date));
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
  });

  it.each(['', 'bad', 'a'.repeat(201), 'a'.repeat(42) + '/', null, 12])(
    'refuses malformed token %# before lookup',
    async invalid => {
      const response = await post({ token: invalid });
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ ok: false });
      expect(mocks.optOut).not.toHaveBeenCalled();
    }
  );

  it('gives unknown, expired and revoked tokens the same response as malformed tokens', async () => {
    mocks.optOut.mockResolvedValue({ ok: false });
    const unknown = await post({ token });
    const malformed = await post({ token: 'bad' });
    expect(unknown.status).toBe(malformed.status);
    expect(await unknown.json()).toEqual(await malformed.json());
  });

  it('refuses malformed JSON without calling the domain', async () => {
    const response = await POST(
      new Request('http://localhost/api/public/sponsor-opt-out', { method: 'POST', body: '{' })
    );
    expect(response.status).toBe(400);
    expect(mocks.optOut).not.toHaveBeenCalled();
  });

  it.each([429, 503])(
    'preserves rate-limit status %i, retry and hardening without lookup',
    async status => {
      mocks.rateLimit.mockResolvedValue(
        new Response(null, { status, headers: { 'Retry-After': '60' } })
      );
      const response = await post({ token });
      expect(response.status).toBe(status);
      expect(response.headers.get('Retry-After')).toBe('60');
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(mocks.optOut).not.toHaveBeenCalled();
      expect(mocks.rateLimit).toHaveBeenCalledWith(
        expect.objectContaining({
          productionSensitive: true,
          contentFreeTelemetry: true,
          analytics: false,
        })
      );
      expect(JSON.stringify(mocks.rateLimit.mock.calls)).not.toContain(token);
    }
  );

  it('returns a retryable error without logging token-bearing exceptions', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    mocks.optOut.mockRejectedValue(new Error(token));
    const response = await post({ token });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ ok: false });
    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    error.mockRestore();
    warn.mockRestore();
  });

  it.each([GET, HEAD, PUT, PATCH, DELETE, OPTIONS])(
    'refuses non-POST method %# without resolving a token',
    handler => {
      const response = handler();
      expect(response.status).toBe(405);
      expect(response.headers.get('Allow')).toBe('POST');
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(mocks.optOut).not.toHaveBeenCalled();
    }
  );
});
