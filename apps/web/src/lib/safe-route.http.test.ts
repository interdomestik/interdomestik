// @vitest-environment node
import { expect, it } from 'vitest';

import { expectResponse, jsonRequest, mocks } from './__fixtures__/safe-route/test-support';
import { POST } from './__fixtures__/safe-route/body';
import {
  actionFailure,
  defaultFailureMessage,
  FAILURE_CODES,
  type FailureCode,
} from './safe-action.failure';
import { isRefusalCode, REFUSAL_CODES } from './safe-action.types';
import { routeReply } from './safe-route';

const expectedStatuses = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  FORBIDDEN_NO_BRANCH: 403,
  FORBIDDEN_NO_AGENT: 403,
  FORBIDDEN_SCOPE_MISMATCH: 403,
  MISSING_TENANT: 403,
  NOT_FOUND: 404,
  RATE_LIMITED: 429,
  SERVICE_UNAVAILABLE: 503,
  INTERNAL_SERVER_ERROR: 500,
} satisfies Record<FailureCode, number>;

it.each([...new Set([...FAILURE_CODES, ...REFUSAL_CODES])])(
  'maps %s to its fixed public status and body',
  async code => {
    mocks.body.mockResolvedValueOnce(
      actionFailure(code, 'private detail', { issues: { private: 'detail' } })
    );
    const response = await POST(jsonRequest(), {});

    await expectResponse(response, expectedStatuses[code]);
    expect(await response.json()).toEqual({
      success: false,
      code,
      error: defaultFailureMessage(code),
    });
    expect(response.headers.get('Retry-After')).toBe(
      code === 'RATE_LIMITED' || code === 'SERVICE_UNAVAILABLE' ? '1' : null
    );
    expect(mocks.body).toHaveBeenCalledTimes(1);
    expect(mocks.values).toHaveBeenCalledTimes(isRefusalCode(code) ? 1 : 0);
  }
);

it.each(['CONFLICT', 'constructor'])('maps an out-of-set code %s to a generic 500', async code => {
  mocks.body.mockResolvedValueOnce(actionFailure(code, 'Version changed'));
  const response = await POST(jsonRequest(), {});

  await expectResponse(response, 500);
  expect(await response.json()).toEqual({
    success: false,
    code: 'INTERNAL_SERVER_ERROR',
    error: 'Internal Server Error',
  });
  expect(mocks.body).toHaveBeenCalledTimes(1);
  expect(mocks.values).toHaveBeenCalledTimes(0);
});

it('treats an inherited failure brand as a handler defect', async () => {
  mocks.body.mockResolvedValueOnce(Object.create(actionFailure('FORBIDDEN')));
  await expectResponse(await POST(jsonRequest(), {}), 500, 'INTERNAL_SERVER_ERROR');
  expect(mocks.body).toHaveBeenCalledTimes(1);
  expect(mocks.capture).toHaveBeenCalledTimes(1);
  expect(mocks.values).toHaveBeenCalledTimes(0);
});

it('supports explicit JSON and empty replies', async () => {
  mocks.body.mockResolvedValueOnce(routeReply(201, { id: 'created' }));
  mocks.body.mockResolvedValueOnce(routeReply(204));

  const created = await POST(jsonRequest(), {});
  await expectResponse(created, 201);
  expect(await created.json()).toEqual({ id: 'created' });
  expect(mocks.body).toHaveBeenCalledTimes(1);

  const empty = await POST(jsonRequest(), {});
  await expectResponse(empty, 204);
  expect(await empty.text()).toBe('');
  expect(mocks.body).toHaveBeenCalledTimes(2);
  expect(mocks.values).toHaveBeenCalledTimes(0);
});
