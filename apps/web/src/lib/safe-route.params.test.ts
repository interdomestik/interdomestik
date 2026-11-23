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

import { CLAIM, expectResponse, jsonRequest, mocks } from './__fixtures__/safe-route/test-support';
import { POST as bodyPost } from './__fixtures__/safe-route/body.fixture';
import { POST } from './__fixtures__/safe-route/role.fixture';
import type { RouteParams } from './safe-route';

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

it('rejects an undeclared captured param when the params schema is omitted', async () => {
  await expectResponse(
    await bodyPost(jsonRequest(), { params: { rest: ['other'] } }),
    400,
    'VALIDATION_ERROR'
  );
  expect(mocks.body).toHaveBeenCalledTimes(0);
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
