// @vitest-environment node
import { expect, it, vi } from 'vitest';

import {
  CLAIM,
  expectResponse,
  jsonRequest,
  mocks,
  request,
  STAFF_SESSION,
} from './__fixtures__/safe-route/test-support';
import { POST as bodyPost } from './__fixtures__/safe-route/body.fixture';
import { POST } from './__fixtures__/safe-route/role.fixture';

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
