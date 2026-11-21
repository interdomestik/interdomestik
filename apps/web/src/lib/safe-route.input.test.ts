// @vitest-environment node
import { types } from 'node:util';
import {
  workAsyncStorage,
  type WorkStore,
} from 'next/dist/server/app-render/work-async-storage.external';
import {
  workUnitAsyncStorage,
  type RequestStore,
} from 'next/dist/server/app-render/work-unit-async-storage.external';
import { createServerParamsForRoute } from 'next/dist/server/request/params';
import { expect, it, vi } from 'vitest';

import {
  BODY_CAP,
  CLAIM,
  expectResponse,
  jsonRequest,
  mocks,
  request,
  STAFF_SESSION,
} from './__fixtures__/safe-route/test-support';
import { POST as bodyPost } from './__fixtures__/safe-route/body.fixture';
import { POST as queryPost } from './__fixtures__/safe-route/query.fixture';
import { POST } from './__fixtures__/safe-route/role.fixture';
import { POST as selfPost } from './__fixtures__/safe-route/self.fixture';
import type { RouteParams } from './safe-route';

it.each([{}, { params: undefined }, { params: Promise.resolve({}) }])(
  'accepts a strict body-only POST with context %j',
  async context => {
    const response = await bodyPost(jsonRequest(), context);
    await expectResponse(response, 200);
    expect(await response.json()).toEqual({ success: true, data: 'body' });
    expect(mocks.body).toHaveBeenCalledTimes(1);
    expect(mocks.body.mock.calls[0][0]).toEqual({ params: {}, query: {}, body: { note: 'x' } });
  }
);

it.each([CLAIM.params, Promise.resolve(CLAIM.params), { caseId: 'CLAIM_A', rest: ['one', 'two'] }])(
  'accepts declared direct, promised and catch-all params (%j)',
  async params => {
    await expectResponse(await POST(jsonRequest('?tags=a&tags=b'), { params }), 200);
    expect(mocks.role).toHaveBeenCalledTimes(1);
    expect(mocks.role.mock.calls[0][0]).toMatchObject({
      params: { caseId: 'claim_a' },
      query: { tags: ['a', 'b'] },
    });
  }
);

it('accepts an optional catch-all that captures zero keys', async () => {
  await expectResponse(await bodyPost(jsonRequest(), { params: Promise.resolve({}) }), 200);
  expect(mocks.body).toHaveBeenCalledTimes(1);
  expect(mocks.body.mock.calls[0][0]).toHaveProperty('params', {});
});

it.each([
  ['body', '{"note":"x","extra":"other"}', '', CLAIM.params],
  ['query', '{"note":"x"}', '?extra=other', CLAIM.params],
  ['params', '{"note":"x"}', '', { ...CLAIM.params, extra: 'other' }],
])('refuses an undeclared %s key before the handler', async (part, body, search, params) => {
  const response = await POST(request({ body, search }), { params });
  await expectResponse(response, 400);
  expect(await response.json()).toMatchObject({
    code: 'VALIDATION_ERROR',
    issues: { [part]: 'unrecognized_keys' },
  });
  expect(mocks.role).toHaveBeenCalledTimes(0);
  expect(mocks.values).toHaveBeenCalledTimes(0);
});

it('rejects an omitted query schema when an identity is injected in the actual query', async () => {
  await expectResponse(await bodyPost(jsonRequest('?tenantId=other'), {}), 400, 'VALIDATION_ERROR');
  expect(mocks.body).toHaveBeenCalledTimes(0);
});

it('rejects an undeclared captured param when the params schema is omitted', async () => {
  await expectResponse(
    await bodyPost(jsonRequest(), { params: { rest: ['other'] } }),
    400,
    'VALIDATION_ERROR'
  );
  expect(mocks.body).toHaveBeenCalledTimes(0);
});

it('rejects an undeclared other-user id on a self route', async () => {
  const response = await selfPost(request({ body: '{"note":"x","userId":"other"}' }), {});
  await expectResponse(response, 400, 'VALIDATION_ERROR');
  expect(mocks.self).toHaveBeenCalledTimes(0);
});

it('preserves validation issue paths from the composed guard', async () => {
  const response = await POST(request({ body: '{"note":""}' }), CLAIM);
  await expectResponse(response, 400);
  expect(await response.json()).toEqual({
    success: false,
    code: 'VALIDATION_ERROR',
    error: 'Invalid input',
    issues: { 'body.note': 'too_small' },
  });
  expect(mocks.role).toHaveBeenCalledTimes(0);
});

it('rejects duplicate scalar query values, before reading the body', async () => {
  const pull = vi.fn();
  const body = new ReadableStream<Uint8Array>({ pull }, { highWaterMark: 0 });
  const response = await POST(request({ body, search: '?term=a&term=b' }), CLAIM);
  await expectResponse(response, 400);
  expect(await response.json()).toMatchObject({
    code: 'VALIDATION_ERROR',
    issues: { 'query.term': 'duplicate_field' },
  });
  expect(pull).toHaveBeenCalledTimes(0);
  expect(mocks.role).toHaveBeenCalledTimes(0);
});

it.each([false, true])(
  'rejects an accessor params field with promised=%s and never runs it',
  async promised => {
    const get = vi.fn(() => 'claim-a');
    const params = Object.defineProperty({}, 'caseId', { get, enumerable: true });

    await expectResponse(
      await POST(jsonRequest(), { params: promised ? Promise.resolve(params) : params }),
      400,
      'VALIDATION_ERROR'
    );
    expect(get).toHaveBeenCalledTimes(0);
    expect(mocks.role).toHaveBeenCalledTimes(0);
  }
);

it('hands a promised proxy record to the guard without enumerating it', async () => {
  const ownKeys = vi.fn(() => ['caseId']);
  const getOwnPropertyDescriptor = vi.fn(() => undefined);
  const params = new Proxy(CLAIM.params, { ownKeys, getOwnPropertyDescriptor });

  await expectResponse(
    await POST(jsonRequest(), { params: Promise.resolve(params) }),
    400,
    'VALIDATION_ERROR'
  );
  expect(ownKeys).toHaveBeenCalledTimes(0);
  expect(getOwnPropertyDescriptor).toHaveBeenCalledTimes(0);
  expect(mocks.role).toHaveBeenCalledTimes(0);
});

it('passes a direct production proxy record to the guard without inspecting it', async () => {
  vi.stubEnv('NODE_ENV', 'production');
  const trap = vi.fn(() => {
    throw new Error('unexpected proxy trap');
  });
  const params = new Proxy(CLAIM.params, { get: trap, getPrototypeOf: trap, ownKeys: trap });

  await expectResponse(await POST(jsonRequest(), { params }), 400, 'VALIDATION_ERROR');
  expect(trap).toHaveBeenCalledTimes(0);
  expect(mocks.role).toHaveBeenCalledTimes(0);
});

it('passes a direct record with an own then accessor to the guard without awaiting it', async () => {
  const get = vi.fn(() => 'injected');
  const params = Object.defineProperty({ ...CLAIM.params }, 'then', { get, enumerable: true });

  await expectResponse(await POST(jsonRequest(), { params }), 400, 'VALIDATION_ERROR');
  expect(get).toHaveBeenCalledTimes(0);
  expect(mocks.role).toHaveBeenCalledTimes(0);
});

it('accepts the proxy promise produced by Next for route params in development', async () => {
  vi.stubEnv('NODE_ENV', 'development');
  // Next reads these stores to select its development path. This fixture has no staged fallback.
  vi.spyOn(workAsyncStorage, 'getStore').mockReturnValue({
    route: '/fixture/[caseId]',
  } as WorkStore);
  vi.spyOn(workUnitAsyncStorage, 'getStore').mockReturnValue({ type: 'request' } as RequestStore);
  const params = createServerParamsForRoute(CLAIM.params) as Promise<RouteParams>;

  expect(types.isProxy(params)).toBe(true);
  expect(await params).toBe(CLAIM.params);
  await expectResponse(await POST(jsonRequest(), { params }), 200);
  expect(mocks.role).toHaveBeenCalledTimes(1);
});

it('runs the limiter, session, params, streamed body, parser and handler in order', async () => {
  const sequence: string[] = [];
  mocks.authorize.mockImplementationOnce(async () => {
    sequence.push('session');
    return STAFF_SESSION;
  });
  mocks.limit.mockImplementationOnce(async () => {
    sequence.push('limiter');
    return null;
  });
  const context = Object.defineProperty({}, 'params', {
    get: () => {
      sequence.push('params');
      return Promise.resolve(CLAIM.params);
    },
  });
  const body = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        sequence.push('body');
        controller.enqueue(new TextEncoder().encode('{"note":"x"}'));
        controller.close();
      },
    },
    { highWaterMark: 0 }
  );
  mocks.refine.mockImplementationOnce(() => {
    sequence.push('parse');
    return true;
  });
  mocks.role.mockImplementationOnce(async () => {
    sequence.push('handler');
  });

  await expectResponse(await POST(request({ body }), context), 200);
  expect(sequence).toEqual(['limiter', 'session', 'params', 'body', 'parse', 'handler']);
  expect(mocks.role).toHaveBeenCalledTimes(1);
});

it('reads a valid JSON body at exactly the byte cap and ignores media-type parameters', async () => {
  const body = '{"note":"x"}';
  expect(Buffer.byteLength(body)).toBe(BODY_CAP);

  await expectResponse(
    await bodyPost(
      request({ body, headers: { 'Content-Type': 'application/json; charset=utf-8' } }),
      {}
    ),
    200
  );
  expect(mocks.body).toHaveBeenCalledTimes(1);
});

it.each([{}, { 'Content-Length': '1' }])(
  'stops at the first chunk over the byte cap with headers %j',
  async headers => {
    const encode = new TextEncoder();
    const beyondCap = vi.fn(() => {
      throw new Error('read beyond capped chunk');
    });
    const cancel = vi.fn();
    let read = 0;
    const body = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          read += 1;
          if (read === 1) controller.enqueue(encode.encode('{"note":"x"}'));
          else if (read === 2) controller.enqueue(encode.encode(' '));
          else beyondCap();
        },
        cancel,
      },
      { highWaterMark: 0 }
    );

    const response = await bodyPost(
      request({ body, headers: new Headers(Object.entries(headers)) }),
      {}
    );

    await expectResponse(response, 400, 'VALIDATION_ERROR');
    expect(read).toBe(2);
    expect(beyondCap).toHaveBeenCalledTimes(0);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(mocks.body).toHaveBeenCalledTimes(0);
  }
);

const validJson = '{"note":"x"}';
const validJsonBytes = new TextEncoder().encode(validJson);
const invalidUtf8 = validJsonBytes.slice();
invalidUtf8[validJson.indexOf('x')] = 0xff;

it.each([
  ['invalid UTF-8', invalidUtf8, 'application/json'],
  ['malformed JSON', '{', 'application/json'],
  ['wrong media type', validJsonBytes, 'text/plain'],
  ['missing media type', validJsonBytes, ''],
  ['empty body', null, 'application/json'],
] as const)(
  'maps %s to validation with no classifier capture',
  async (_name, body, contentType) => {
    const response = await bodyPost(
      request({ body, headers: { 'Content-Type': contentType } }),
      {}
    );
    await expectResponse(response, 400, 'VALIDATION_ERROR');
    expect(mocks.capture).toHaveBeenCalledTimes(0);
    expect(mocks.body).toHaveBeenCalledTimes(0);
    expect(mocks.values).toHaveBeenCalledTimes(0);
  }
);

it('requires the body stream to be empty on a schema-less route', async () => {
  const search = '?caseId=CASE_A';
  await expectResponse(
    await queryPost(request({ search, body: '{}' }), {}),
    400,
    'VALIDATION_ERROR'
  );
  expect(mocks.query).toHaveBeenCalledTimes(0);
  await expectResponse(await queryPost(request({ search }), {}), 200);
  expect(mocks.query).toHaveBeenCalledTimes(1);
});
