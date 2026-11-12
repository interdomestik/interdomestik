import type { Event } from '@sentry/nextjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { scrubSentryBreadcrumb, scrubSentryEvent, scrubSentrySpan } from './sentry-privacy';
import {
  scrubStackFilename,
  scrubTransactionName,
  scrubUrl,
  toRouteFamily,
} from './sentry-url-privacy';

describe('Sentry URL privacy review probes', () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each(['AliceSmith:private', 'tokenSecret:medical', 'tenant-alice:secret'])(
    'never exports an arbitrary URL scheme: %s',
    url => {
      expect(scrubUrl(url)).toBe('[redacted]');
      expect(scrubStackFilename(url)).toBe('[redacted]');
      const result = scrubSentryEvent({
        request: { url },
        tags: { url },
        exception: { values: [{ stacktrace: { frames: [{ filename: url }] } }] },
      });
      expect(JSON.stringify(result)).not.toMatch(
        /alicesmith|tokensecret|tenant-alice|medical|secret|private/i
      );
    }
  );

  it.each([
    '/en/member/claims/settings',
    '/en/member/claims/claims',
    '/en/member/claims/%73ettings',
    '/en/admin/claims/settings',
    '/en/agent/clients/settings',
    '/en/staff/claims/settings',
    '/member/claims/settings',
    '/api/documents/settings',
    '/api/documents/settings/download',
    '/en/admin/sponsors/settings/terms/member',
  ])('redacts IDs even when they are route words: %s', path => {
    const expected = path
      .replace(/%73ettings|settings/g, ':id')
      .replace(/\/terms\/member$/, '/terms/:id');
    const safe = path.endsWith('/claims/claims') ? '/en/member/claims/:id' : expected;
    expect(toRouteFamily(path)).toBe(safe);
    expect(scrubUrl(path + '?token=private#secret')).toBe(safe);
    expect(scrubTransactionName('GET ' + path)).toBe('GET ' + safe);
    expect(scrubSentryEvent({ transaction: 'GET ' + path })?.transaction).toBe('GET ' + safe);
    expect(
      scrubSentrySpan({
        trace_id: 'trace',
        span_id: 'span',
        start_timestamp: 1,
        data: { 'http.route': path },
      }).data
    ).toEqual({ 'http.route': safe });
  });

  it.each(['/en/member/settings', '/en/member/claims/new', '/api/health', '/en/admin/analytics'])(
    'preserves actual static routes: %s',
    path => {
      expect(toRouteFamily(path)).toBe(path);
    }
  );

  it('redacts unrecognized suffixes after the longest known route prefix', () => {
    expect(toRouteFamily('/en/member/claims/settings/profile/member')).toBe(
      '/en/member/claims/:id/:id/:id'
    );
    expect(toRouteFamily('/settings/member/settings')).not.toContain('/settings/');
  });

  it.each([
    'https://tenant-alice.example.test',
    'https://tenant-alice.interdomestik.com',
    'https://www.interdomestik.com.evil.test',
    'https://tenant-alice.supabase.co',
    'http://127.0.0.1:31415',
  ])('redacts unapproved origins on every URL surface: %s', origin => {
    const url = origin + '/en/member/claims/settings?token=private#medical';
    const expected = origin.split(':')[0] + '://[redacted-host]/en/member/claims/:id';
    const frameUrl = origin + '/_next/static/chunks/9889-a9108038039.js';
    const safeFrame =
      origin.split(':')[0] + '://[redacted-host]/_next/static/chunks/9889-a9108038039.js';
    const event = scrubSentryEvent<Event>({
      request: { url },
      transaction: url,
      tags: { url, from: url, to: url, 'http.url': url },
      breadcrumbs: [{ category: 'navigation', data: { from: url, to: url } }],
      exception: {
        values: [{ stacktrace: { frames: [{ filename: frameUrl, abs_path: frameUrl }] } }],
      },
      debug_meta: {
        images: [
          {
            type: 'sourcemap',
            code_file: frameUrl,
            debug_id: '123e4567-e89b-42d3-a456-426614174000',
          },
        ],
      },
    });
    expect(event).not.toBeNull();
    expect(event?.request?.url).toBe(expected);
    expect(event?.transaction).toBe(expected);
    expect(event?.tags).toMatchObject({
      url: expected,
      from: expected,
      to: expected,
      'http.url': expected,
    });
    expect(event?.breadcrumbs?.[0].data).toEqual({ from: expected, to: expected });
    expect(event?.exception?.values?.[0].stacktrace?.frames?.[0]).toMatchObject({
      filename: safeFrame,
      abs_path: safeFrame,
    });
    expect(event?.debug_meta?.images?.[0].code_file).toBe(safeFrame);
    expect(scrubStackFilename(frameUrl)).toBe(safeFrame);
    expect(
      scrubSentrySpan({ trace_id: 'trace', span_id: 'span', start_timestamp: 1, data: { url } })
        .data
    ).toEqual({ url: expected });
    expect(scrubSentryBreadcrumb({ category: 'fetch', data: { url } })?.data).toEqual({
      url: expected,
    });
    expect(JSON.stringify(event)).not.toMatch(/tenant-alice|evil|31415|settings|private|medical/);
    expect(scrubSentryEvent(event!)).toEqual(event);
  });

  it.each(['https://www.interdomestik.com', 'https://staging.interdomestik.com'])(
    'keeps deployment origins from CD configuration: %s',
    origin => {
      expect(scrubUrl(origin + '/en/member/settings')).toBe(origin + '/en/member/settings');
    }
  );

  it('admits only the exact explicitly configured app origin', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://configured-app.example.test');
    expect(scrubUrl('https://configured-app.example.test/en/login')).toBe(
      'https://configured-app.example.test/en/login'
    );
    expect(scrubUrl('https://tenant.configured-app.example.test/en/login')).toBe(
      'https://[redacted-host]/en/login'
    );
    expect(scrubUrl('https://configured-app.example.test:8443/en/login')).toBe(
      'https://[redacted-host]/en/login'
    );
  });
});
