import type { Event } from '@sentry/nextjs';
import { describe, expect, it } from 'vitest';
import { safeMechanismType, safeNextDigest, safeReactErrorCode } from './sentry-diagnostic-labels';
import { scrubSentryEvent } from './sentry-privacy';

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

  it('labels long digests and messages from their bounded prefix only', () => {
    const longRedirect = `NEXT_REDIRECT;push;/sq/member/claims/${'claim-private'.repeat(200)};307;`;
    expect(safeNextDigest(errorWith({ digest: longRedirect }))).toBe('NEXT_REDIRECT');
    const longReact = `Minified React error #31; visit https://react.dev/errors/31?args[]=${'private'.repeat(170)}`;
    expect(longReact.length).toBeGreaterThan(1200);
    const event = scrubbedException('generic', new Error(longReact));
    expect(event?.tags?.react_error).toBe('31');
    expect(JSON.stringify(event)).not.toContain('private');
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
