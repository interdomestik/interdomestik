// @vitest-environment node
import { expect, it, vi } from 'vitest';

import {
  BODY_CAP,
  CLAIM,
  expectResponse,
  jsonRequest,
  mocks,
  request,
} from './__fixtures__/safe-route/test-support';
import { POST as bodyPost } from './__fixtures__/safe-route/body.fixture';
import { POST as queryPost } from './__fixtures__/safe-route/query.fixture';
import { POST } from './__fixtures__/safe-route/role.fixture';
import { POST as selfPost } from './__fixtures__/safe-route/self.fixture';

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
