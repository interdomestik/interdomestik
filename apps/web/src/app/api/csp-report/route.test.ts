import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  captureMessage: vi.fn(),
  enforceRateLimit: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({
  captureMessage: hoisted.captureMessage,
}));

vi.mock('@/lib/rate-limit', () => ({
  enforceRateLimit: hoisted.enforceRateLimit,
}));

import { GET, POST } from './route';

function makeRequest(init?: { contentType?: string; body?: unknown; cookie?: string }): Request {
  const headers = new Headers();
  if (init?.contentType) headers.set('content-type', init.contentType);
  if (init?.cookie) headers.set('cookie', init.cookie);

  return new Request('http://localhost:3000/api/csp-report', {
    method: 'POST',
    headers,
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

describe('/api/csp-report', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.enforceRateLimit.mockResolvedValue(null);
  });

  it('rejects GET with 405', async () => {
    const response = await GET();

    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('POST');
  });

  it('rejects unsupported content types with 415', async () => {
    const response = await POST(makeRequest({ contentType: 'application/json', body: {} }));

    expect(response.status).toBe(415);
    expect(hoisted.captureMessage).not.toHaveBeenCalled();
  });

  it('returns 204 for legacy CSP reports and strips sensitive fields before Sentry capture', async () => {
    const response = await POST(
      makeRequest({
        contentType: 'application/csp-report',
        cookie: 'better-auth.session_token=secret',
        body: {
          'csp-report': {
            'blocked-uri': 'https://cdn.example/script.js?token=secret',
            'document-uri': 'https://app.example/member/help?otp=secret',
            disposition: 'report',
            'script-sample': 'inline secret',
            'violated-directive': 'script-src https:',
          },
        },
      })
    );

    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(hoisted.captureMessage).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(hoisted.captureMessage.mock.calls[0])).not.toContain('better-auth');
    expect(JSON.stringify(hoisted.captureMessage.mock.calls[0])).not.toContain('secret');
  });

  it('accepts Reporting API reports with modern Chrome field names', async () => {
    const response = await POST(
      makeRequest({
        contentType: 'application/reports+json',
        body: [
          {
            type: 'csp-violation',
            body: {
              blockedURL: 'https://cdn.example/script.js?token=secret',
              documentURL: 'https://app.example/sq?otp=secret',
              disposition: 'enforce',
              effectiveDirective: 'script-src-elem',
              originalPolicy: 'x'.repeat(700),
              sourceFile: 'https://cdn.example/source.js?session=secret',
            },
          },
        ],
      })
    );

    expect(response.status).toBe(204);
    expect(hoisted.captureMessage).toHaveBeenCalledTimes(1);
    expect(hoisted.captureMessage).toHaveBeenCalledWith(
      'csp.violation',
      expect.objectContaining({
        tags: expect.objectContaining({
          'csp.directive': 'script-src-elem',
          'csp.disposition': 'report',
          'csp.blocked_host': 'cdn.example',
          'csp.document_host': 'app.example',
        }),
        extra: expect.objectContaining({
          blockedUri: 'https://cdn.example/script.js',
          documentUri: 'https://app.example/sq',
          sourceFile: 'https://cdn.example/source.js',
        }),
      })
    );
    expect(JSON.stringify(hoisted.captureMessage.mock.calls[0])).not.toContain('secret');
  });

  it('returns 204 without parsing reports when rate-limited', async () => {
    hoisted.enforceRateLimit.mockResolvedValueOnce(new Response('limited', { status: 429 }));

    const response = await POST(
      makeRequest({
        contentType: 'application/csp-report',
        body: { invalid: true },
      })
    );

    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
    expect(hoisted.captureMessage).not.toHaveBeenCalled();
  });

  it('bounds oversized report bodies without capture', async () => {
    const response = await POST(
      makeRequest({
        contentType: 'application/csp-report',
        body: { 'csp-report': { 'blocked-uri': 'x'.repeat(20_000) } },
      })
    );

    expect(response.status).toBe(204);
    expect(hoisted.captureMessage).not.toHaveBeenCalled();
  });

  it('caps Reporting API events per request', async () => {
    const reports = Array.from({ length: 12 }, (_, index) => ({
      type: 'csp-violation',
      body: {
        blockedURL: `https://cdn${index}.example/script.js`,
        documentURL: 'https://app.example/sq',
        effectiveDirective: 'script-src',
      },
    }));

    const response = await POST(
      makeRequest({
        contentType: 'application/reports+json',
        body: reports,
      })
    );

    expect(response.status).toBe(204);
    expect(hoisted.captureMessage).toHaveBeenCalledTimes(10);
  });

  it('marks the rate-limit call production sensitive', async () => {
    await POST(
      makeRequest({
        contentType: 'application/csp-report',
        body: {},
      })
    );

    expect(hoisted.enforceRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'api/csp-report',
        limit: 60,
        windowSeconds: 60,
        productionSensitive: true,
      })
    );
  });
});
