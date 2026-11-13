import { describe, expect, it } from 'vitest';
import { scrubSentryEvent } from './sentry-privacy';
import { scrubStackFilename } from './sentry-url-privacy';

describe('Sentry build frame allowlist', () => {
  it.each([
    'app:///_next/static/chunks/9889-a9108038039.js',
    'app:///_next/static/chunks/4bd1b696-c023c6e3521b1417.js',
    'app:///_next/static/chunks/1234.abcdef123456.js',
    'app:///_next/static/chunks/4bd1b696.abcdef123456.js',
    'https://staging.interdomestik.com/_next/static/chunks/1234.abcdef123456.js',
    'app:///_next/static/chunks/main-app-a9108038039.mjs',
    'app:///_next/static/chunks/app/[locale]/(app)/member/claims/[id]/page-a9108038039.js',
    'app:///_next/static/css/a9108038039.css',
    'app:///.next/server/chunks/97131.js',
    'app:///_next/server/chunks/97131.js',
    'app:///_next/server/app/[locale]/admin/claims/[id]/page.js',
    'app:///_next/server/pages/_error.js',
    'app:///.next/server/chunks/a9108038039.mjs',
    'app:///.next/server/app/[locale]/admin/claims/[id]/page.js',
    'app:///.next/server/app/[locale]/(app)/dashboard/[[...slug]]/page.js',
    'app:///.next/server/app/[locale]/(app)/member/(portal)/@actions/page.js',
    'app:///.next/server/app/api/auth/[...all]/route.js',
    'app:///.next/server/pages/_app.js',
    'app:///.next/server/pages/[locale]/member/settings.js',
    'node:internal/process/task_queues',
    'node:internal/timers',
    'node:internal/modules/cjs/loader',
    'node:events',
  ])('keeps source-owned frame identity and coordinates for %s', filename => {
    expect(scrubStackFilename(filename)).toBe(filename);
    const event = scrubSentryEvent({
      exception: {
        values: [
          { stacktrace: { frames: [{ filename, abs_path: filename, lineno: 310, colno: 9 }] } },
        ],
      },
    });
    expect(event?.exception?.values?.[0].stacktrace?.frames?.[0]).toMatchObject({
      filename,
      abs_path: filename,
      lineno: 310,
      colno: 9,
    });
  });

  it.each([
    'app:///_next/static/chunks/alice@example.test.js',
    'app:///_next/static/chunks/123e4567-e89b-12d3-a456-426614174000.js',
    'app:///_next/static/chunks/alice-a9108038039.js',
    'app:///_next/static/chunks/AliceSmith.abcdef123456.js',
    'app:///_next/static/chunks/tokenSecret.abcdef123456.js',
    'app:///_next/static/chunks/1234.tokenSecret.js',
    'app:///_next/static/chunks/1234.abcdef123456.js?token=private',
    'app:///_next/static/chunks/alice/page-a9108038039.js',
    'app:///_next/static/chunks/9889-a9108038039.js?token=private',
    'app:///_next/static/chunks/9889-a9108038039.js#private',
    'app:///_next/static/chunks/../chunks/9889-a9108038039.js',
    'app:///_next/static/chunks/%2e%2e/chunks/9889-a9108038039.js',
    'app:///_next/static/chunks/app/[alice]/page-a9108038039.js',
    'app:///.next/server/chunks/123e4567-e89b-12d3-a456-426614174000.js',
    'app:///.next/server/chunks/97131.js?signature=private',
    'app:///.next/server/app/[locale]/admin/claims/alice/page.js',
    'app:///.next/server/app/[locale]/admin/claims/legal/page.js',
    'app:///.next/server/app/[locale]/member/claims/clients/page.js',
    'app:///_next/static/chunks/app/[locale]/admin/claims/legal/page-a9108038039.js',
    'app:///.next/server/app/[locale]/admin/claims/alice@example.test/page.js',
    'app:///.next/server/app/[locale]/admin/claims/(alice)/page.js',
    'app:///.next/server/app/[locale]/admin/claims/../../settings/page.js',
    'app:///.next/server/app/[locale]//admin/page.js',
    'app:///.next/server/app/%5Blocale%5D/admin/page.js',
    'app:///.next/server/app/[locale]/admin/claims/42/page.js',
    'app:///.next/server/app/:id/admin/claims/:id/page.js',
    'app:///_next/server/app/[locale]/admin/claims/alice/page.js',
    'app:///_next/server/chunks/97131.js?token=private',
    'app:///_next/server/chunks/../chunks/97131.js',
    'app:///.next/server/pages/alice.js',
    'app:///.next/server/pages/admin/../member/settings.js',
    'app:///.next/server/chunks/97131.js/extra',
    'app:///storage/v1/object/sign/claims/alice.pdf?token=private',
    'app://user:password@host/.next/server/chunks/97131.js',
    'app:////.next/server/chunks/97131.js',
    'app:///.next/server/chunks\\97131.js',
    'app:///.next/server/chunks/97131.js\n',
    'node:internal/process/alice',
    'node:internal/process/../timers',
    'node:internal/timers?token=private',
    'node:alice@example.test',
  ])('redacts the entire untrusted frame %s', filename => {
    expect(scrubStackFilename(filename)).toBe(`${filename.split(':')[0]}:[redacted-uri]`);
  });

  it('never treats URL-normalized traversal as a build artifact', () => {
    const filename = 'https://example.test/_next/static/chunks/private/../9889-a9108038039.js';
    expect(scrubStackFilename(filename)).not.toContain('9889-a9108038039.js');
    expect(scrubStackFilename(filename)).not.toContain('private');
  });

  it.each([
    'app:///_next/static/chunks/1234.abcdef123456.js',
    'https://staging.interdomestik.com/_next/static/chunks/1234.abcdef123456.js',
  ])('retains Debug ID association for webpack dynamic chunks: %s', filename => {
    const image = {
      type: 'sourcemap' as const,
      code_file: filename,
      debug_id: '123e4567-e89b-42d3-a456-426614174000',
    };
    const event = scrubSentryEvent({
      exception: { values: [{ stacktrace: { frames: [{ filename, lineno: 2, colno: 5 }] } }] },
      debug_meta: { images: [image] },
    });
    expect(event?.debug_meta).toEqual({ images: [image] });
    expect(scrubSentryEvent(event!)).toEqual(event);
  });
});
