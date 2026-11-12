import type { Event } from '@sentry/nextjs';
import { describe, expect, it } from 'vitest';
import { safeMechanismType, safeNextDigest, safeReactErrorCode } from './sentry-diagnostic-labels';
import { scrubSentryEvent } from './sentry-privacy';
import { scrubStackFilename } from './sentry-url-privacy';

function errorWith(fields: Record<string, unknown>): Error {
  return Object.assign(new Error('raw private text'), fields);
}

function scrubbedException(mechanismType: string, original: unknown): Event | null {
  return scrubSentryEvent(
    {
      exception: {
        values: [
          {
            type: 'Error',
            value: 'raw private text',
            mechanism: { type: mechanismType, handled: false },
          },
        ],
      },
    },
    { originalException: original }
  );
}

describe('Sentry diagnostic labels', () => {
  it.each([
    ['HANGING_PROMISE_REJECTION', 'HANGING_PROMISE_REJECTION'],
    ['DYNAMIC_SERVER_USAGE', 'DYNAMIC_SERVER_USAGE'],
    ['BAILOUT_TO_CLIENT_SIDE_RENDERING', 'BAILOUT_TO_CLIENT_SIDE_RENDERING'],
    ['NEXT_PRERENDER_INTERRUPTED', 'NEXT_PRERENDER_INTERRUPTED'],
    ['NEXT_HTTP_ERROR_FALLBACK;404', 'NEXT_HTTP_ERROR_FALLBACK;404'],
    ['NEXT_REDIRECT;replace;/sq/member/claims/claim-private?token=x;307;', 'NEXT_REDIRECT'],
  ])('labels the Next digest %s without exporting free text', (digest, label) => {
    const event = scrubbedException('auto.function.nextjs.server_component', errorWith({ digest }));
    expect(event?.tags?.next_digest).toBe(label);
    expect(event?.fingerprint).toEqual(['{{ default }}', 'Error', label]);
    expect(event?.exception?.values?.[0].mechanism).toEqual({
      type: 'auto.function.nextjs.server_component',
      handled: false,
    });
    const serialized = JSON.stringify(event);
    for (const forbidden of ['claim-private', 'token', 'raw private text'])
      expect(serialized).not.toContain(forbidden);
  });

  it.each([
    '1234567890',
    'NEXT_HTTP_ERROR_FALLBACK;500',
    'HANGING_PROMISE_REJECTION;extra',
    'hanging_promise_rejection',
    42,
    'x'.repeat(600),
  ])('drops an unreviewed digest %s', digest => {
    expect(safeNextDigest(errorWith({ digest }))).toBeUndefined();
    const event = scrubbedException('generic', errorWith({ digest }));
    expect(event?.tags?.next_digest).toBeUndefined();
    expect(event?.fingerprint).toBeUndefined();
  });

  it('keeps only the numeric code of a minified React error', () => {
    const original = new Error(
      'Minified React error #441; visit https://react.dev/errors/441 for the full message'
    );
    expect(safeReactErrorCode(original)).toBe('441');
    expect(scrubbedException('generic', original)?.tags?.react_error).toBe('441');
    expect(
      safeReactErrorCode(new Error('React error #441 for alice@example.test'))
    ).toBeUndefined();
    expect(safeReactErrorCode({ message: 'Minified React error #12345;' })).toBeUndefined();
    expect(safeReactErrorCode(null)).toBeUndefined();
  });

  it('keeps reviewed capture mechanisms and collapses the rest to generic', () => {
    for (const type of [
      'auto.node.onunhandledrejection',
      'auto.function.nextjs.on_request_error',
      'auto.browser.global_handlers.onerror',
    ])
      expect(safeMechanismType(type)).toBe(type);
    for (const type of ['custom', 'auto.function.nextjs.alice', undefined, 7])
      expect(safeMechanismType(type)).toBe('generic');
  });
});

describe('Sentry runtime package frames', () => {
  it.each([
    [
      '/var/task/apps/web/node_modules/next/dist/compiled/next-server/app-page.runtime.prod.js',
      '/node_modules/next/dist/compiled/next-server/app-page.runtime.prod.js',
    ],
    [
      '/Users/alice/dev/node_modules/.pnpm/next@16.4.1/node_modules/next/dist/server/request/params.js',
      '/node_modules/next/dist/server/request/params.js',
    ],
    [
      '/var/task/node_modules/@sentry/core/build/cjs/utils/handleCallbackErrors.js',
      '/node_modules/@sentry/core/build/cjs/utils/handleCallbackErrors.js',
    ],
    [
      '/node_modules/react-dom/cjs/react-dom-server.node.production.js',
      '/node_modules/react-dom/cjs/react-dom-server.node.production.js',
    ],
  ])('keeps the package-relative path of %s', (filename, expected) => {
    expect(scrubStackFilename(filename)).toBe(expected);
    expect(scrubStackFilename(expected)).toBe(expected);
  });

  it.each([
    '/var/task/apps/web/node_modules/private-pkg/index.js',
    '/var/task/apps/web/src/app/[locale]/admin/users/[id]/page.tsx',
    '/var/task/apps/web/node_modules/next/dist/../../../secret.js',
    '/var/task/apps/web/node_modules/next/dist/data.json',
    '/var/task/apps/web/node_modules/next/dist/alice smith.js',
    '/Users/alice/node_modules/next/dist/server.js?token=x',
  ])('does not keep the unreviewed path %s', filename => {
    const scrubbed = scrubStackFilename(filename);
    expect(scrubbed.startsWith('/node_modules/')).toBe(false);
    for (const forbidden of ['alice', 'private-pkg', 'secret', 'token', 'var/task'])
      expect(scrubbed).not.toContain(forbidden);
  });
});
