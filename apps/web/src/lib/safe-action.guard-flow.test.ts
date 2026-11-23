// @vitest-environment node
import { isRedirectError } from 'next/dist/client/components/redirect-error';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { authorizedSession, MEMBER_A, STAFF_A } from '@/test/safe-action-harness';

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), write: vi.fn(), capture: vi.fn() }));
vi.mock('@/lib/tenant-authority.server', () => ({ authorizeSessionTenant: mocks.authorize }));
vi.mock('@/lib/audit.core', () => ({ writeAuditEvent: mocks.write }));
vi.mock('@sentry/nextjs', () => ({
  captureException: mocks.capture,
  setUser: vi.fn(),
  setTag: vi.fn(),
}));
vi.mock('next/navigation', async importOriginal => importOriginal());
vi.mock('./safe-action.refusal', { spy: true });

import { redirect } from 'next/navigation';
import { actionFailure, actionNormalizers, defineAction, defineFormAction } from './safe-action';
import { assertPristineObjectPrototype, ObjectPrototypeIntegrityError } from './safe-action.guard';
import { extractSubject } from './safe-action.refusal';

const definition = {
  name: 'guard.flow',
  basis: { kind: 'role', roles: ['staff'] },
  subject: { type: 'claim', from: 'claimId' },
} as const;
const input = z.strictObject({ claimId: z.string(), note: z.string().optional() });
const deny = async () => actionFailure('FORBIDDEN');

beforeEach(() => {
  vi.resetAllMocks();
  mocks.authorize.mockResolvedValue(authorizedSession(STAFF_A));
  mocks.write.mockResolvedValue({ ok: true });
});

describe('the action guard sequence and refusal subject', () => {
  it('refuses overlapping nullable branches before a refinement can run', () => {
    const refine = vi.fn(() => false);
    const handler = vi.fn(async () => 'never');
    expect(() =>
      defineAction({
        ...definition,
        input: z.strictObject({
          claimId: z.union([z.string().nullable().refine(refine), z.number().nullable()]),
        }),
        handler,
      })
    ).toThrow(/overlapping branches and a refinement/);
    expect(handler).not.toHaveBeenCalled();
    expect(refine).not.toHaveBeenCalled();
  });

  it('records one FORBIDDEN row for an Error thrown by refine against the submitted snapshot ID', async () => {
    const raw = { claimId: 'ID-A' };
    const error = Object.assign(new Error('denied'), { code: 'FORBIDDEN' });
    const action = defineAction({
      ...definition,
      input: z.strictObject({
        claimId: z.string().refine(() => {
          raw.claimId = 'ID-B';
          throw error;
        }),
      }),
      handler: async () => 'never',
    });
    expect(await action(raw)).toMatchObject({ success: false, code: 'FORBIDDEN' });
    expect(mocks.write).toHaveBeenCalledTimes(1);
    expect(mocks.write.mock.calls[0][0].metadata).toMatchObject({
      code: 'FORBIDDEN',
      subject: { type: 'claim', id: 'ID-A' },
    });
  });

  it('returns an internal failure and zero rows for a code-only refinement throw', async () => {
    const action = defineAction({
      ...definition,
      input: z.strictObject({
        claimId: z.string().refine(() => {
          throw { code: 'FORBIDDEN' };
        }),
      }),
      handler: async () => 'never',
    });
    expect(await action({ claimId: 'ID-A' })).toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it('treats a throwing message getter as an ordinary parser failure without calling it', async () => {
    const message = vi.fn(() => {
      throw new Error('metadata getter');
    });
    const thrown = Object.defineProperty({}, 'message', { get: message });
    const action = defineAction({
      ...definition,
      input: z.strictObject({
        claimId: z.string().refine(() => {
          throw thrown;
        }),
      }),
      handler: async () => 'never',
    });
    expect(await action({ claimId: 'ID-A' })).toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
    expect(message).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it('lets a genuine redirect thrown in refine escape by identity', async () => {
    let thrown: unknown;
    const action = defineAction({
      ...definition,
      input: z.strictObject({
        claimId: z.string().refine(() => {
          try {
            redirect('/claims');
          } catch (error) {
            thrown = error;
            throw error;
          }
        }),
      }),
      handler: async () => 'never',
    });
    const result = await action({ claimId: 'ID-A' }).catch(error => error);
    expect(isRedirectError(result)).toBe(true);
    expect(result).toBe(thrown);
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it('keeps the original submitted record and Date through synchronous refine and records the pre-normalised ID', async () => {
    const date = new Date(1000);
    const raw = { claimId: 'ID-A', note: 'original', date };
    const handler = vi.fn(deny);
    const action = defineAction({
      ...definition,
      input: z.strictObject({
        claimId: z
          .string()
          .check(actionNormalizers.toLowerCase)
          .refine(() => {
            raw.claimId = 'ID-B';
            raw.note = 'changed';
            date.setTime(0);
            return true;
          }),
        note: z.string(),
        date: z.date().min(new Date(500)),
      }),
      handler,
    });
    expect(await action(raw)).toMatchObject({ code: 'FORBIDDEN' });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      { claimId: 'id-a', note: 'original', date: new Date(1000) },
      expect.anything()
    );
    expect(mocks.write.mock.calls[0][0].metadata.subject).toEqual({ type: 'claim', id: 'ID-A' });
  });

  it('lets the role denial win over malformed form input and reads the subject with intrinsic getAll', async () => {
    mocks.authorize.mockResolvedValue(authorizedSession(MEMBER_A));
    const form = new FormData();
    form.append('claimId', 'ID-A');
    form.append('note', 'first');
    form.append('note', 'duplicate');
    const getAll = vi.fn(() => ['ID-B']);
    Object.defineProperty(form, 'getAll', { value: getAll });
    const handler = vi.fn(deny);
    const action = defineFormAction({ ...definition, input, handler });
    expect(await action(undefined, form)).toMatchObject({ code: 'FORBIDDEN' });
    expect(getAll).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
    expect(mocks.write.mock.calls[0][0].metadata.subject).toEqual({ type: 'claim', id: 'ID-A' });
  });

  it('does not read a proxy subject before an authorised snapshot and records unknown on role denial', async () => {
    mocks.authorize.mockResolvedValue(authorizedSession(MEMBER_A));
    const trap = vi.fn(() => {
      throw new Error('proxy');
    });
    const raw = new Proxy({}, { getOwnPropertyDescriptor: trap, get: trap, ownKeys: trap });
    expect(await defineAction({ ...definition, input, handler: deny })(raw)).toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(mocks.write.mock.calls[0][0].metadata.subject).toEqual({ type: 'claim', id: 'unknown' });
    expect(trap).not.toHaveBeenCalled();
  });

  it('skips the subject read on an authority-free denial', async () => {
    mocks.authorize.mockResolvedValue(null);
    const subjectRead = vi.fn(() => 'ID-A');
    const raw = Object.defineProperty({}, 'claimId', { get: subjectRead });
    expect(await defineAction({ ...definition, input, handler: deny })(raw)).toMatchObject({
      code: 'UNAUTHORIZED',
    });
    expect(subjectRead).not.toHaveBeenCalled();
    expect(extractSubject).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it.each([
    ['wrong user', { userId: 'other-user' }],
    ['wrong tenant', { tenantId: 'other-tenant' }],
    ['injected access tenant', { accessTenantId: 'other-tenant' }],
  ])('denies %s identity input before the self handler', async (_kind, injected) => {
    const handler = vi.fn(deny);
    const action = defineAction({ ...definition, basis: { kind: 'self' }, input, handler });
    expect(await action({ claimId: 'ID-A', ...injected })).toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    expect(handler).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it('rejects inherited failure brands and preserves own non-HTTP codes', async () => {
    const raw = { claimId: 'ID-A' };
    const inherited = defineAction({
      ...definition,
      input,
      handler: async () => Object.create(actionFailure('FORBIDDEN')),
    });
    expect(await inherited(raw)).toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
    expect(mocks.write).not.toHaveBeenCalled();
    const conflict = defineAction({
      ...definition,
      input,
      handler: async () => actionFailure('CONFLICT', 'Version changed'),
    });
    expect(await conflict(raw)).toEqual({
      success: false,
      code: 'CONFLICT',
      error: 'Version changed',
    });
  });

  it('rejects with the integrity error when Sentry reporting throws', async () => {
    const action = defineAction({ ...definition, input, handler: deny });
    const reportingError = new Error('reporting failed');
    mocks.capture.mockImplementationOnce(() => {
      throw reportingError;
    });
    const key = 'unrelated';
    Object.defineProperty(Object.prototype, key, { configurable: true, value: true });
    let error: unknown;
    try {
      await action({ claimId: 'ID-A' });
    } catch (value) {
      error = value;
    } finally {
      Reflect.deleteProperty(Object.prototype, key);
    }
    expect(error).toBeInstanceOf(ObjectPrototypeIntegrityError);
    expect(mocks.capture).toHaveBeenCalledOnce();
    expect(error).not.toBe(reportingError);
  });

  it('keeps the error from an inner gate by identity after the prototype is restored', async () => {
    let inner: unknown;
    mocks.authorize.mockImplementationOnce(async () => {
      Object.defineProperty(Object.prototype, 'skipChecks', { configurable: true, value: true });
      try {
        assertPristineObjectPrototype();
      } catch (error) {
        inner = error;
        throw error;
      } finally {
        Reflect.deleteProperty(Object.prototype, 'skipChecks');
      }
    });
    const action = defineAction({ ...definition, input, handler: deny });
    const error = await action({ claimId: 'ID-A' }).catch(value => value);
    expect(error).toBeInstanceOf(ObjectPrototypeIntegrityError);
    expect(error).toBe(inner);
    expect(mocks.capture).toHaveBeenCalledOnce();
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it('gates refusal recording if reason appears on Object.prototype while the handler runs', async () => {
    const failure = actionFailure('FORBIDDEN');
    const handler = async () => {
      Object.defineProperty(Object.prototype, 'reason', {
        configurable: true,
        value: 'cross_tenant',
      });
      return failure;
    };
    let error: unknown;
    try {
      error = await defineAction({ ...definition, input, handler })({ claimId: 'ID-A' }).catch(
        value => value
      );
    } finally {
      Reflect.deleteProperty(Object.prototype, 'reason');
    }
    expect(error).toBeInstanceOf(ObjectPrototypeIntegrityError);
    expect(mocks.write).not.toHaveBeenCalled();
  });
});
