import type { Event } from '@sentry/nextjs';
import { describe, expect, it } from 'vitest';
import { scrubSentryEvent } from './sentry-privacy';
import { scrubStackFilename } from './sentry-url-privacy';

describe('Sentry frame privacy review probes', () => {
  it.each(['AliceSmith.ts', 'tokenSecret.js', 'DEADBEEF.tsx', 'login-form.tsx'])(
    'does not trust a bare source filename: %s',
    filename => {
      expect(scrubStackFilename(filename)).toBe('[redacted]');
      const result = scrubSentryEvent({
        exception: { values: [{ stacktrace: { frames: [{ filename, abs_path: filename }] } }] },
      });
      expect(JSON.stringify(result)).not.toContain(filename);
    }
  );

  it.each(['app:///.next/server/chunks/97131.js', 'AliceSmith.ts'])(
    'constructs frames and stacks from reviewed fields only: %s',
    filename => {
      const frame = {
        filename,
        abs_path: filename,
        function: 'tokenSecret',
        module: 'alice@example.test',
        context_line: 'medical free text',
        pre_context: ['diagnosis details'],
        post_context: ['treatment notes'],
        vars: { password: 'credential' },
        raw_function: 'private raw symbol',
        source_link: 'https://private.example/source',
        package: 'private package',
        unknown_field: 'private extension',
        lineno: 310,
        colno: 9,
        in_app: true,
      };
      const source = {
        exception: {
          values: [{ stacktrace: { frames: [frame], registers: { secret: 'private register' } } }],
        },
      };
      const result = scrubSentryEvent<Event>(source);
      expect(result).not.toBeNull();
      expect(result?.exception?.values?.[0].stacktrace).toEqual({
        frames: [
          {
            filename: filename.startsWith('app:') ? filename : '[redacted]',
            abs_path: filename.startsWith('app:') ? filename : '[redacted]',
            lineno: 310,
            colno: 9,
            in_app: true,
          },
        ],
      });
      expect(JSON.stringify(result)).not.toMatch(
        /tokenSecret|alice|medical|diagnosis|treatment|credential|private/
      );
      expect(frame.module).toBe('alice@example.test');
      expect(scrubSentryEvent(result!)).toEqual(result);
    }
  );

  it.each(['alice@example.test', {}, NaN, Infinity, -1, 1.5])(
    'drops nontechnical coordinates and flags: %s',
    value => {
      const result = scrubSentryEvent({
        exception: {
          values: [
            {
              mechanism: { type: 'generic', handled: value },
              stacktrace: {
                frames: [{ filename: 'node:events', lineno: value, colno: value, in_app: value }],
              },
            },
          ],
        },
      } as unknown as Event);
      const exception = result?.exception?.values?.[0];
      expect(result).not.toBeNull();
      expect(exception?.stacktrace?.frames?.[0]).toEqual({ filename: 'node:events' });
      expect(exception?.mechanism?.handled).toBeUndefined();
    }
  );
});
