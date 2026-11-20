import {
  NodeClient,
  Scope,
  defaultStackParser,
  type Event,
  type rewriteFramesIntegration,
} from '@sentry/nextjs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { scrubSentryEvent } from './sentry-privacy';

class PostgresError extends Error {
  override name = 'PostgresError';
  code = '23505';
  detail = 'private@example.test';
  query = 'SELECT private FROM users';
}
const DEBUG_ID = '123e4567-e89b-42d3-a456-426614174000';

describe('Sentry exception classification', () => {
  afterEach(() => vi.unstubAllGlobals());
  it.each([
    'TenantStoragePathError',
    'PostgresError',
    'TypeError',
    'Error',
    'DrizzleQueryError',
    'DynamicServerError',
  ])('keeps only the class %s with a generic value', type => {
    const source = {
      exception: { values: [{ type, value: 'private@example.test token=secret' }] },
      tags: { error_type: 'ForgedType', postgres_code: 'XXXXX' },
      fingerprint: ['private grouping'],
    };
    const result = scrubSentryEvent<Event>(source);
    expect(result?.exception?.values?.[0]).toMatchObject({ type, value: 'Application failure' });
    expect(result?.tags).toEqual({ error_type: type });
    expect(scrubSentryEvent(source)).toEqual(result);
    expect(result?.fingerprint).toBeUndefined();
    expect(JSON.stringify(result)).not.toMatch(/private|secret|ForgedType|XXXXX/);
    expect(source.exception.values[0].value).toContain('private@example.test');
  });

  it.each([
    'AliceSmith',
    'TokenSecret',
    'DEADBEEF01234567',
    'A'.repeat(64),
    'AB',
    'A'.repeat(65),
    'privateError',
    'Private@Example',
    'Error: private',
    'Error\n',
  ])('falls back for unsafe class %s', type => {
    const result = scrubSentryEvent<Event>({
      exception: { values: [{ type, value: 'private' }] },
    });
    expect(result?.exception?.values?.[0].type).toBe('Error');
    expect(result?.tags).toEqual({ error_type: 'Error' });
    expect(JSON.stringify(result)).not.toContain(type);
  });

  it.each(['23505', '23503', '40001', '40P01', '57014', '53300', '42P01', '08006', 'P0001'])(
    'tags only the SQLSTATE %s from the hint',
    code => {
      const originalException = Object.assign(new PostgresError('private query failure'), { code });
      const result = scrubSentryEvent<Event>(
        { exception: { values: [{ type: 'PostgresError', value: originalException.message }] } },
        { originalException }
      );
      expect(result?.tags).toEqual({ error_type: 'PostgresError', postgres_code: code });
      expect(result?.fingerprint).toEqual(['{{ default }}', 'PostgresError', code]);
      expect(JSON.stringify(result)).not.toMatch(/private|SELECT|users|query|detail/);
    }
  );

  it.each([
    'ALICE',
    'ABCDE',
    '99999',
    '235ZZ',
    '23505\n',
    '2350',
    '235050',
    '42p01',
    'email@example.test',
    '?token=secret',
    23505,
  ])('drops invalid SQLSTATE %s', code => {
    const result = scrubSentryEvent<Event>(
      { exception: { values: [{ type: 'PostgresError', value: 'private' }] } },
      { originalException: { name: 'PostgresError', code } }
    );
    expect(result?.tags).toEqual({ error_type: 'PostgresError' });
    expect(result?.fingerprint).toBeUndefined();
  });

  it('does not accept codes from unrelated errors, custom tags or exception payloads', () => {
    for (const originalException of [
      undefined,
      null,
      '23505',
      { name: 'TypeError', code: '23505' },
    ]) {
      const exception = { type: 'PostgresError', value: 'private', code: '23505' };
      expect(
        scrubSentryEvent(
          { exception: { values: [exception] }, tags: { postgres_code: '23505' } },
          { originalException }
        )?.tags
      ).toEqual({ error_type: 'PostgresError' });
    }
  });

  it('fails closed if a hint getter throws', () => {
    expect(
      scrubSentryEvent(
        { exception: { values: [{ type: 'PostgresError' }] } },
        {
          originalException: {
            get name() {
              throw new Error('private');
            },
          },
        }
      )
    ).toBeNull();
  });

  it('classifies a captured postgres.js-shaped error through the actual SDK beforeSend hook', async () => {
    const sourceFile = `${process.cwd()}/.next/server/chunks/97131.js`;
    const stack = `PostgresError: private\n    at r (${sourceFile}:310:9)`;
    vi.stubGlobal('_sentryDebugIds', { [stack]: DEBUG_ID });
    const sdkDirectory = dirname(
      createRequire(import.meta.url).resolve('@sentry/nextjs/package.json')
    );
    const integrationPath = pathToFileURL(
      join(sdkDirectory, 'build/esm/server/distDirRewriteFramesIntegration.js')
    ).href;
    const {
      distDirRewriteFramesIntegration,
    }: {
      distDirRewriteFramesIntegration(options: {
        distDirName: string;
      }): ReturnType<typeof rewriteFramesIntegration>;
    } = await import(integrationPath);
    const sent: Event[] = [];
    const client = new NodeClient({
      dsn: 'https://testkey@sentry.example/123',
      integrations: [distDirRewriteFramesIntegration({ distDirName: '.next' })],
      stackParser: defaultStackParser,
      beforeSend: scrubSentryEvent,
      transport: () => ({
        send: envelope => {
          for (const item of envelope[1]) {
            if (item[0].type === 'event') sent.push(item[1] as Event);
          }
          return Promise.resolve({ statusCode: 200 });
        },
        flush: () => Promise.resolve(true),
      }),
    });
    client.init();
    const error = new PostgresError('private@example.test token=secret');
    error.stack = stack;
    const scope = new Scope();
    scope.setClient(client);
    scope.captureException(error);
    expect(await client.flush(500)).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0].tags).toEqual({ error_type: 'PostgresError', postgres_code: '23505' });
    expect(sent[0].exception?.values?.[0]).toMatchObject({
      type: 'PostgresError',
      value: 'Application failure',
      stacktrace: {
        frames: [{ filename: 'app:///_next/server/chunks/97131.js', lineno: 310, colno: 9 }],
      },
    });
    expect(JSON.stringify(sent)).not.toMatch(/private|secret|SELECT/);
    const filename = 'app:///_next/server/chunks/97131.js';
    client.captureEvent({
      exception: {
        values: [{ type: 'TypeError', stacktrace: { frames: [{ filename: sourceFile }] } }],
      },
    });
    expect(await client.flush(500)).toBe(true);
    expect(sent).toHaveLength(2);
    expect(sent[1].debug_meta).toEqual({
      images: [{ type: 'sourcemap', code_file: filename, debug_id: DEBUG_ID }],
    });
    await client.close(500);
  });

  it('retains only build Debug IDs linked to a kept frame, dropping other image payloads', () => {
    const filename = 'app:///.next/server/chunks/97131.js';
    const valid = { type: 'sourcemap' as const, code_file: filename, debug_id: DEBUG_ID };
    const privateImage = { ...valid, debug_file: 'private@example.test', data: 'SELECT private' };
    const images = [
      privateImage,
      { ...valid, code_file: 'app:///.next/server/app/alice/page.js' },
      { ...valid, code_file: filename + '?token=secret' },
      { ...valid, code_file: 'app:///.next/server/chunks/97132.js' },
      { ...valid, code_file: 'node:internal/timers' },
      { ...valid, type: 'wasm' as const },
      ...['private@example.test', DEBUG_ID + '\n', DEBUG_ID + '0', 'z'.repeat(36)].map(
        debug_id => ({
          ...valid,
          debug_id,
        })
      ),
    ];
    const result = scrubSentryEvent<Event>({
      exception: { values: [{ stacktrace: { frames: [{ filename }] } }] },
      debug_meta: { images },
    });
    expect(result?.debug_meta).toEqual({ images: [valid] });
    expect(JSON.stringify(result)).not.toMatch(/private|secret|SELECT|alice|97132/);
    expect(scrubSentryEvent({ debug_meta: { images: [valid] } })?.debug_meta).toBeUndefined();
  });

  it('never exports objects coercible to class names or technical IDs', () => {
    const filename = 'app:///.next/server/chunks/97131.js';
    const coercible = (value: string): object => ({
      toString: () => value,
      private: 'alice@example.test',
    });
    const frameFile = {
      ...coercible(filename),
      startsWith: (prefix: string) => filename.startsWith(prefix),
      slice: (start: number) => filename.slice(start),
    };
    const event = {
      exception: {
        values: [
          {
            type: coercible('TypeError'),
            stacktrace: { frames: [{ filename }, { filename: frameFile, abs_path: frameFile }] },
          },
        ],
      },
      debug_meta: {
        images: [
          { type: 'sourcemap', code_file: filename, debug_id: coercible(DEBUG_ID) },
          { type: 'sourcemap', code_file: coercible(filename), debug_id: DEBUG_ID },
        ],
      },
    } as unknown as Event;
    const result = scrubSentryEvent(event);
    expect(result?.exception?.values?.[0].type).toBe('Error');
    expect(result?.exception?.values?.[0].stacktrace?.frames?.[1]).toMatchObject({
      filename: '[redacted]',
      abs_path: '[redacted]',
    });
    expect(result?.debug_meta).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain('alice');
  });
});
