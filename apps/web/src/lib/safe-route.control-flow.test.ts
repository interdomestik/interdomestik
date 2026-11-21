// @vitest-environment node
import { runInNewContext } from 'node:vm';
import { getRedirectError } from 'next/dist/client/components/redirect';
import { expect, it, vi } from 'vitest';
import { z } from 'zod';

import { authorizedSession, MEMBER_A } from '@/test/safe-action-harness';

import {
  CLAIM,
  expectAudit,
  expectResponse,
  jsonRequest,
  mocks,
  STAFF_SESSION,
} from './__fixtures__/safe-route/test-support';
import { POST } from './__fixtures__/safe-route/role';
import { defineAction } from './safe-action';
import { ObjectPrototypeIntegrityError } from './safe-action.guard';

function redirectError() {
  return getRedirectError('/fixture-target', 'replace');
}

function rejectedParams(error: unknown): Promise<never> {
  const params = Promise.reject(error);
  // This fixture owns a promise that can settle before the route has passed request gates.
  void params.catch(() => undefined);
  return params;
}

function actionThrowing(error: unknown) {
  const handler = vi.fn(async () => {
    throw error;
  });
  const call = defineAction({
    name: 'fixtures.action-parity',
    basis: { kind: 'self' },
    input: z.strictObject({}),
    subject: { type: 'none' },
    handler,
  });
  return { call, handler };
}

it.each(['handler', 'refine', 'params'] as const)(
  'preserves the redirect from %s by identity',
  async source => {
    const error = redirectError();
    const params = source === 'params' ? rejectedParams(error) : CLAIM.params;
    if (source === 'handler') mocks.role.mockRejectedValueOnce(error);
    if (source === 'refine')
      mocks.refine.mockImplementationOnce(() => {
        throw error;
      });

    await expect(POST(jsonRequest(), { params })).rejects.toBe(error);
    expect(mocks.role).toHaveBeenCalledTimes(source === 'handler' ? 1 : 0);
    expect(mocks.values).toHaveBeenCalledTimes(0);
    expect(mocks.capture).toHaveBeenCalledTimes(0);
  }
);

it.each(['handler', 'refine'] as const)(
  'uses the action classifier for code FORBIDDEN from %s and audits the submitted subject',
  async source => {
    const failure = Object.assign(new Error('private detail'), { code: 'FORBIDDEN' });
    if (source === 'handler') mocks.role.mockRejectedValueOnce(failure);
    else
      mocks.refine.mockImplementationOnce(() => {
        throw failure;
      });

    const response = await POST(jsonRequest(), CLAIM);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      success: false,
      code: 'FORBIDDEN',
      error: 'Forbidden',
    });
    expectAudit(STAFF_SESSION, 'fixtures.role', 'FORBIDDEN', 'role', {
      type: 'claim',
      id: 'CLAIM_A',
    });
    expect(mocks.role).toHaveBeenCalledTimes(source === 'handler' ? 1 : 0);
    expect(mocks.capture).toHaveBeenCalledTimes(0);
  }
);

it('preserves a nested redirect by identity during refusal subject extraction and in an action', async () => {
  const redirect = redirectError();
  const error = new Error('x', { cause: redirect });
  const action = actionThrowing(error);
  mocks.authorize.mockResolvedValueOnce(authorizedSession(MEMBER_A));

  await expect(POST(jsonRequest(), { params: rejectedParams(error) })).rejects.toBe(redirect);
  await expect(action.call({})).rejects.toBe(redirect);
  expect(mocks.role).toHaveBeenCalledTimes(0);
  expect(action.handler).toHaveBeenCalledTimes(1);
  expect(mocks.values).toHaveBeenCalledTimes(0);
  expect(mocks.capture).toHaveBeenCalledTimes(0);
});

it('uses Next cause order before the outer bare NEXT_REDIRECT message', async () => {
  const redirect = redirectError();
  const error = new Error('NEXT_REDIRECT', { cause: redirect });
  mocks.role.mockRejectedValueOnce(error);

  await expect(POST(jsonRequest(), CLAIM)).rejects.toBe(redirect);
  expect(mocks.role).toHaveBeenCalledTimes(1);
  expect(mocks.values).toHaveBeenCalledTimes(0);
});

it('matches the action classifier for a foreign-realm wrapper', async () => {
  const error = runInNewContext('new Error("foreign", { cause })', { cause: redirectError() });
  const action = actionThrowing(error);
  mocks.role.mockRejectedValueOnce(error);

  const response = await POST(jsonRequest(), CLAIM);
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual(await action.call({}));
  expect(mocks.role).toHaveBeenCalledTimes(1);
  expect(action.handler).toHaveBeenCalledTimes(1);
  expect(mocks.values).toHaveBeenCalledTimes(0);
});

it.each([false, true])(
  'keeps the refusal when a cause getter would throw=%s a redirect (D132-r)',
  async throws => {
    const redirect = redirectError();
    const get = vi.fn(() => {
      if (throws) throw redirect;
      return redirect;
    });
    const error = Object.defineProperty(new Error('x'), 'cause', { get });
    const caller = authorizedSession(MEMBER_A);
    mocks.authorize.mockResolvedValueOnce(caller);

    await expectResponse(
      await POST(jsonRequest(), { params: rejectedParams(error) }),
      403,
      'FORBIDDEN'
    );

    expectAudit(caller, 'fixtures.role', 'FORBIDDEN', 'role', { type: 'claim', id: 'unknown' });
    expect(get).toHaveBeenCalledTimes(0);
    expect(mocks.role).toHaveBeenCalledTimes(0);
    expect(mocks.capture).toHaveBeenCalledTimes(0);
  }
);

it('keeps the wrong-role denial on an ordinary params rejection', async () => {
  const caller = authorizedSession(MEMBER_A);
  mocks.authorize.mockResolvedValueOnce(caller);

  await expectResponse(
    await POST(jsonRequest(), { params: rejectedParams(new Error('lookup')) }),
    403,
    'FORBIDDEN'
  );

  expectAudit(caller, 'fixtures.role', 'FORBIDDEN', 'role', { type: 'claim', id: 'unknown' });
  expect(mocks.role).toHaveBeenCalledTimes(0);
});

it('returns generic 500 without reading accessor fields on a thrown value', async () => {
  const cause = vi.fn(() => redirectError());
  const message = vi.fn(() => 'detail');
  const error = Object.defineProperties(new Error(), {
    cause: { get: cause },
    message: { get: message },
  });
  mocks.role.mockRejectedValueOnce(error);

  await expectResponse(await POST(jsonRequest(), CLAIM), 500, 'INTERNAL_SERVER_ERROR');

  expect(cause).toHaveBeenCalledTimes(0);
  expect(message).toHaveBeenCalledTimes(0);
  expect(mocks.role).toHaveBeenCalledTimes(1);
  expect(mocks.capture).toHaveBeenCalledTimes(1);
  expect(mocks.values).toHaveBeenCalledTimes(0);
});

it('keeps the guard’s thenable-refinement defect when a predicate returns a rejection', async () => {
  mocks.refine.mockReturnValueOnce(rejectedParams(redirectError()));

  await expectResponse(await POST(jsonRequest(), CLAIM), 500, 'INTERNAL_SERVER_ERROR');

  expect(mocks.refine).toHaveBeenCalledTimes(1);
  expect(mocks.role).toHaveBeenCalledTimes(0);
  expect(mocks.values).toHaveBeenCalledTimes(0);
  expect(mocks.capture).toHaveBeenCalledExactlyOnceWith(expect.any(Error), {
    extra: { operation: 'fixtures.role', reason: 'thenable_refinement' },
  });
});

it.each(['session', 'handler', 'params'] as const)(
  'preserves an integrity error from %s by identity',
  async from => {
    const error = new ObjectPrototypeIntegrityError();
    if (from === 'session') mocks.authorize.mockRejectedValueOnce(error);
    if (from === 'handler') mocks.role.mockRejectedValueOnce(error);
    if (from === 'params') mocks.authorize.mockResolvedValueOnce(authorizedSession(MEMBER_A));
    const params = from === 'params' ? rejectedParams(error) : CLAIM.params;

    await expect(POST(jsonRequest(), { params })).rejects.toBe(error);

    expect(mocks.role).toHaveBeenCalledTimes(from === 'handler' ? 1 : 0);
    expect(mocks.values).toHaveBeenCalledTimes(0);
    expect(mocks.capture).toHaveBeenCalledTimes(0);
  }
);
