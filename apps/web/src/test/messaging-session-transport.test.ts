// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MessagingSessionTransport,
  parseFlightResult,
  sanitizeTransport,
} from '../../e2e/gate/messaging-session-transport';

const DUMMY_COOKIE = 'unit-test-cookie-value';
const ORIGIN = 'http://messaging.example.test';
const validBody = '0:{"a":"$@1"}\n1:{"success":true}\n';
const flight = (
  body = validBody,
  contentType: string | null = 'text/x-component',
  status = 200
) => ({ body, contentType, status });

afterEach(() => vi.unstubAllGlobals());

describe('credential transport sanitization', () => {
  it.each(['throw', 'reject'] as const)(
    'replaces a credential-bearing %s before reporting',
    async mode => {
      const unsafe = new Error(`Cookie: better-auth.session_token=${DUMMY_COOKIE}`);
      const failure = await sanitizeTransport(() => {
        if (mode === 'throw') throw unsafe;
        return Promise.reject(unsafe);
      }).catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(Error);
      const error = failure as Error;
      expect(error.message).toBe(
        'Messaging fixture request failed; credential diagnostics suppressed'
      );
      expect(error.message).not.toContain(DUMMY_COOKIE);
      expect(error.stack).not.toContain(DUMMY_COOKIE);
      expect(error).not.toHaveProperty('cause');
      expect(error).not.toBe(unsafe);
    }
  );

  it('passes through successful operations', async () => {
    await expect(sanitizeTransport(() => Promise.resolve(42))).resolves.toBe(42);
  });
});

describe('Flight action result binding', () => {
  it('resolves the root action reference with a MIME charset parameter', () => {
    expect(parseFlightResult(flight(validBody, 'text/x-component; charset=utf-8'))).toEqual({
      success: true,
    });
  });

  it('ignores an unrelated earlier success record and follows the root reference', () => {
    const body = '2:{"success":true}\n0:{"a":"$@b"}\nb:{"success":false,"error":"Access denied"}\n';
    expect(parseFlightResult(flight(body))).toEqual({ success: false, error: 'Access denied' });
  });

  it.each([
    ['referenced error', '2:{"success":true}\n0:{"a":"$@1"}\n1:E{"digest":"private-diagnostic"}'],
    ['missing result', '0:{"a":"$@9"}\n1:{"success":true}'],
    ['missing action reference', '0:{}\n1:{"success":true}'],
    ['missing root', '1:{"success":true}'],
    ['unsupported reference', '0:{"a":"$L1"}\n1:{"success":true}'],
    ['duplicate result', `${validBody}1:{"success":false}`],
    ['duplicate root', `${validBody}0:{"a":"$@1"}`],
    ['non-object result', '0:{"a":"$@1"}\n1:[{"success":true}]'],
    ['non-boolean success', '0:{"a":"$@1"}\n1:{"success":"true"}'],
  ])('rejects %s without exposing the payload', (_label, body) => {
    expect(() => parseFlightResult(flight(body))).toThrow('Invalid messaging Flight response');
  });

  it.each([null, 'text/html', 'application/json', 'text/x-component-invalid'])(
    'rejects content type %s',
    contentType => {
      expect(() => parseFlightResult(flight(validBody, contentType))).toThrow(
        'Invalid messaging Flight response'
      );
    }
  );

  it('rejects a non-200 response even when it contains a valid action result', () => {
    expect(() => parseFlightResult(flight(validBody, 'text/x-component', 500))).toThrow(
      'Invalid messaging Flight response'
    );
  });
});

describe('single-origin in-memory session jar', () => {
  it('uses native fetch, retains cookies, removes revoked cookies and replays a captured cookie', async () => {
    const headers = new Headers();
    headers.append(
      'set-cookie',
      `better-auth.session_token=${DUMMY_COOKIE}; Path=/; HttpOnly; SameSite=Lax`
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('{}', { headers }))
      .mockResolvedValueOnce(
        new Response('{}', {
          headers: { 'set-cookie': 'better-auth.session_token=; Path=/; Max-Age=0' },
        })
      )
      .mockResolvedValue(new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);
    const transport = new MessagingSessionTransport(ORIGIN);
    await transport.request('/api/auth/sign-in/email', { method: 'POST', body: '{}' });
    const captured = transport.cookies();
    expect(captured).toEqual([
      expect.objectContaining({
        name: 'better-auth.session_token',
        value: DUMMY_COOKIE,
        domain: 'messaging.example.test',
        path: '/',
        httpOnly: true,
      }),
    ]);
    await transport.request('/api/auth/sign-out', { method: 'POST', body: '{}' });
    expect(transport.cookies()).toEqual([]);
    transport.replaceCookies(captured);
    await transport.request('/sq/partners', { method: 'POST', body: '[]' });
    const options = fetchMock.mock.calls[2][1] as RequestInit;
    expect(options.redirect).toBe('manual');
    expect(new Headers(options.headers).get('cookie')).toBe(
      `better-auth.session_token=${DUMMY_COOKIE}`
    );
  });

  it('sanitizes native fetch failures and never follows a redirect', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error(`Cookie: session=${DUMMY_COOKIE}`));
    vi.stubGlobal('fetch', fetchMock);
    const transport = new MessagingSessionTransport(ORIGIN);
    await expect(transport.request('/api/auth/get-session')).rejects.toThrow(
      'Messaging fixture request failed; credential diagnostics suppressed'
    );
    expect(fetchMock.mock.calls[0][1].redirect).toBe('manual');
  });

  it('refuses cross-origin destinations before sending cookies', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      new MessagingSessionTransport(ORIGIN).request('http://other.example.test')
    ).rejects.toThrow('Messaging fixture request failed; credential diagnostics suppressed');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
