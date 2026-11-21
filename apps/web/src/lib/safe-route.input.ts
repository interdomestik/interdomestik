import { types } from 'node:util';

import { actionFailure, type ActionFailure } from './safe-action.failure';
import {
  assertPristineObjectPrototype,
  isIntegrityError,
  type InputGuard,
} from './safe-action.guard';
import { checkControlFlow } from './safe-action.recheck';
import type { RouteContext } from './safe-route';

function paramsPromise(value: unknown): value is Promise<unknown> {
  // Next's development wrapper is a proxy over a native promise with an untrapped prototype.
  return (
    types.isPromise(value) ||
    (process.env.NODE_ENV === 'development' &&
      types.isProxy(value) &&
      Object.getPrototypeOf(value) === Promise.prototype)
  );
}

export async function readParams(context: RouteContext): Promise<{ params: unknown }> {
  const source = context.params;
  const params = paramsPromise(source) ? await source : source;
  assertPristineObjectPrototype();
  // Box the result so the async return never assimilates a direct record's `then` property.
  return { params: params === undefined && source === undefined ? {} : params };
}

function searchParams(request: Request): URLSearchParams {
  return new URL(request.url).searchParams;
}

export function readQuerySubject(request: Request, key: string): object | undefined {
  const values = searchParams(request).getAll(key);
  if (values.length === 1) return { __proto__: null, [key]: values[0] };
  return undefined;
}

export function readQuery(
  request: Request,
  fieldKind: InputGuard['fieldKind']
): { query: Record<string, string | string[]> } | { failure: ActionFailure } {
  const query: Record<string, string | string[]> = Object.create(null);
  for (const [key, value] of searchParams(request)) {
    const previous = query[key];
    if (Array.isArray(previous)) previous.push(value);
    else if (previous !== undefined) {
      return {
        failure: actionFailure('VALIDATION_ERROR', undefined, {
          issues: { [`query.${key}`]: 'duplicate_field' },
        }),
      };
    } else {
      query[key] = fieldKind(['query', key]) === 'array' ? [value] : value;
    }
  }
  return { query };
}

async function readBytes(body: ReadableStream<Uint8Array>, cap: number): Promise<Buffer | null> {
  const reader = body.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const chunk = await reader.read();
      assertPristineObjectPrototype();
      if (chunk.done) return Buffer.concat(chunks, size);
      size += chunk.value.byteLength;
      if (size > cap) {
        await reader.cancel();
        assertPristineObjectPrototype();
        return null;
      }
      if (chunk.value.byteLength) chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
}

function parseBody(bytes: Uint8Array): { body: unknown } | { failure: ActionFailure } {
  let decoding = true;
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    decoding = false;
    return { body: JSON.parse(text) };
  } catch (error) {
    if (isIntegrityError(error)) throw error;
    assertPristineObjectPrototype();
    const expected = decoding ? TypeError.prototype : SyntaxError.prototype;
    if (!types.isNativeError(error) || Object.getPrototypeOf(error) !== expected) throw error;
    return { failure: actionFailure('VALIDATION_ERROR') };
  }
}

export async function readBody(
  request: Request,
  hasSchema: boolean,
  maxBodyBytes: number
): Promise<{ body: unknown } | { failure: ActionFailure }> {
  const contentType = request.headers.get('Content-Type')?.split(';', 1)[0].trim().toLowerCase();
  if (hasSchema && contentType !== 'application/json') {
    return { failure: actionFailure('VALIDATION_ERROR') };
  }
  let bytes: Buffer | null;
  try {
    bytes = request.body
      ? await readBytes(request.body, hasSchema ? maxBodyBytes : 0)
      : Buffer.alloc(0);
    assertPristineObjectPrototype();
  } catch (error) {
    checkControlFlow(error);
    return { failure: actionFailure('VALIDATION_ERROR') };
  }
  if (bytes === null) return { failure: actionFailure('VALIDATION_ERROR') };
  return hasSchema ? parseBody(bytes) : { body: {} };
}
