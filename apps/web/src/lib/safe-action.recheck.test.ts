// @vitest-environment node
import { isRedirectError } from 'next/dist/client/components/redirect-error';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { authorizedSession, STAFF_A } from '@/test/safe-action-harness';

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), write: vi.fn(), capture: vi.fn() }));
vi.mock('@/lib/tenant-authority.server', () => ({ authorizeSessionTenant: mocks.authorize }));
vi.mock('@/lib/audit.core', () => ({ writeAuditEvent: mocks.write }));
vi.mock('@sentry/nextjs', () => ({
  captureException: mocks.capture,
  setUser: vi.fn(),
  setTag: vi.fn(),
}));
vi.mock('./safe-action.output', { spy: true });
vi.mock('./safe-action.recheck', { spy: true });

import {
  actionFailure,
  ActionDefinitionError,
  defineAction,
  defineFormAction,
} from './safe-action';
import { exactParsedInput } from './safe-action.output';
import {
  assertPristineObjectPrototype,
  isIntegrityError,
  ObjectPrototypeIntegrityError,
} from './safe-action.recheck';

const definition = {
  name: 'guard.gates',
  basis: { kind: 'role', roles: ['staff'] },
  subject: { type: 'none' },
} as const;
const input = z.strictObject({ field: z.string().min(1) });
const handler = vi.fn(async () => 'ok');

function install(key: PropertyKey, value: unknown) {
  Object.defineProperty(Object.prototype, key, { configurable: true, value });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authorize.mockResolvedValue(authorizedSession(STAFF_A));
  mocks.write.mockResolvedValue({ ok: true });
});

describe('Object.prototype integrity', () => {
  it.each([
    'skipChecks',
    'aborted',
    'continue',
    'coerce',
    'when',
    'unrelated',
    'issues',
    'statusText',
    'data',
    'then',
  ])('rejects at invocation under inherited %s, and succeeds after restoration', async key => {
    const action = defineAction({ ...definition, input, handler });
    const substitute = vi.fn();
    install(key, key === 'then' ? substitute : true);
    let error: unknown;
    try {
      await action({ field: 'ok' });
    } catch (value) {
      error = value;
    } finally {
      Reflect.deleteProperty(Object.prototype, key);
    }
    expect(error).toBeInstanceOf(ObjectPrototypeIntegrityError);
    expect((error as Error).message).toEqual(new ObjectPrototypeIntegrityError().message);
    expect(mocks.authorize).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
    expect(substitute).not.toHaveBeenCalled();
    expect(await action({ field: 'ok' })).toMatchObject({ success: true });
  });

  it('gates before starting a form or a selected object union branch', async () => {
    const formAction = defineFormAction({ ...definition, input, handler });
    const branch = z.strictObject({ tag: z.literal('one'), branchKey: z.boolean().optional() });
    const unionAction = defineAction({
      ...definition,
      input: z.strictObject({ field: z.discriminatedUnion('tag', [branch]) }),
      handler,
    });
    const form = new FormData();
    form.append('field', 'ok');
    install('branchKey', true);
    let received: unknown[];
    try {
      received = await Promise.allSettled([
        formAction(undefined, form),
        unionAction({ field: { tag: 'one' } }),
      ]);
    } finally {
      Reflect.deleteProperty(Object.prototype, 'branchKey');
    }
    expect(received).toEqual([
      { status: 'rejected', reason: expect.any(ObjectPrototypeIntegrityError) },
      { status: 'rejected', reason: expect.any(ObjectPrototypeIntegrityError) },
    ]);
    expect(handler).not.toHaveBeenCalled();
  });

  it('rejects synchronously at definition and captures only a fixed label for an unknown name', () => {
    const key = 'fixture@example.test';
    let error: unknown;
    install(key, true);
    try {
      defineAction({ ...definition, input, handler });
    } catch (value) {
      error = value;
    } finally {
      Reflect.deleteProperty(Object.prototype, key);
    }
    expect(error).toBeInstanceOf(ObjectPrototypeIntegrityError);
    expect(JSON.stringify(mocks.capture.mock.calls)).toContain('unknown-string:1');
    expect(JSON.stringify(mocks.capture.mock.calls)).not.toContain(key);
  });

  it('shadows an inherited redirect digest with an own integrity digest and cause', async () => {
    const action = defineAction({ ...definition, input, handler });
    install('digest', 'NEXT_REDIRECT;replace;/x;307;');
    let error: unknown;
    try {
      await action({ field: 'ok' });
    } catch (value) {
      error = value;
    } finally {
      Reflect.deleteProperty(Object.prototype, 'digest');
    }
    expect(error).toMatchObject({ digest: 'OBJECT_PROTOTYPE_INTEGRITY', cause: undefined });
    expect(Object.hasOwn(error as object, 'cause')).toBe(true);
    expect(isRedirectError(error)).toBe(false);
  });

  it('rejects replacement of a standard descriptor and rechecks after a developer shape getter', () => {
    const baseline = Object.getOwnPropertyDescriptor(Object.prototype, 'valueOf')!;
    const schema = z.strictObject({
      get field() {
        Object.defineProperty(Object.prototype, 'valueOf', { ...baseline, value: () => 1 });
        return z.string();
      },
    });
    let error: unknown;
    try {
      defineAction({ ...definition, input: schema, handler });
    } catch (value) {
      error = value;
    } finally {
      Object.defineProperty(Object.prototype, 'valueOf', baseline);
    }
    expect(error).toBeInstanceOf(ObjectPrototypeIntegrityError);
    expect(JSON.stringify(mocks.capture.mock.calls)).toContain('replaced:valueOf');
    expect(() => assertPristineObjectPrototype()).not.toThrow();
  });

  it.each([false, true])(
    'gates a parse that settles under pollution (rejected=%s)',
    async rejected => {
      const schema = z.strictObject({
        field: z.string().refine(async () => {
          await Promise.resolve();
          install('skipChecks', true);
          if (rejected) throw Object.assign(new Error('denied'), { code: 'FORBIDDEN' });
          return false;
        }),
      });
      const action = defineAction({ ...definition, input: schema, handler });
      let error: unknown;
      try {
        await action({ field: 'ok' });
      } catch (value) {
        error = value;
      } finally {
        Reflect.deleteProperty(Object.prototype, 'skipChecks');
      }
      expect(isIntegrityError(error)).toBe(true);
      expect(handler).not.toHaveBeenCalled();
      expect(mocks.write).not.toHaveBeenCalled();
      expect(mocks.capture.mock.calls.every(([captured]) => isIntegrityError(captured))).toBe(true);
    }
  );

  it('rejects when a callable then appears as the handler settles', async () => {
    let complete!: (result: string) => void;
    let started!: () => void;
    const settled = new Promise<string>(resolve => {
      complete = resolve;
    });
    const handling = new Promise<void>(resolve => {
      started = resolve;
    });
    const substitute = vi.fn();
    const action = defineAction({
      ...definition,
      input,
      handler: () => {
        started();
        return settled;
      },
    });
    const result = action({ field: 'ok' });
    await handling;
    install('then', substitute);
    let error: unknown;
    try {
      complete('ok');
      await result;
    } catch (value) {
      error = value;
    } finally {
      Reflect.deleteProperty(Object.prototype, 'then');
    }
    expect(isIntegrityError(error)).toBe(true);
    expect(substitute).not.toHaveBeenCalled();
  });

  it('records only own refusal fields on null-prototype writer records with the gate stubbed', async () => {
    const refusal = actionFailure('FORBIDDEN');
    const action = defineAction({ ...definition, input, handler: async () => refusal });
    vi.mocked(assertPristineObjectPrototype).mockImplementation(() => {});
    install('reason', 'cross_tenant');
    try {
      await action({ field: 'ok' });
    } finally {
      Reflect.deleteProperty(Object.prototype, 'reason');
      vi.mocked(assertPristineObjectPrototype).mockRestore();
    }
    expect(mocks.write).toHaveBeenCalledOnce();
    const argument = mocks.write.mock.calls[0][0];
    expect(Object.getPrototypeOf(argument)).toBeNull();
    expect(Object.getPrototypeOf(argument.metadata)).toBeNull();
    expect('reason' in argument).toBe(false);
    expect('reason' in argument.metadata).toBe(false);
  });

  it('returns a scrubbed internal failure on a parsed copy-shape defect', async () => {
    vi.mocked(exactParsedInput).mockReturnValueOnce({ kind: 'defect' });
    const action = defineAction({ ...definition, input, handler });
    expect(await action({ field: 'submitted-value' })).toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
    });
    expect(handler).not.toHaveBeenCalled();
    expect(mocks.capture).toHaveBeenCalledOnce();
    expect(JSON.stringify(mocks.capture.mock.calls)).not.toContain('submitted-value');
  });

  it('refuses inherited roles, including with the gate stubbed', () => {
    const restore = vi.fn(() => {
      Reflect.deleteProperty(Object.prototype, 'roles');
      return z.string();
    });
    const schema = z.strictObject({
      get field() {
        return restore();
      },
    });
    const unauthorised = {
      ...definition,
      input: schema,
      handler,
      basis: { kind: 'role' },
    } as never;
    install('roles', ['staff']);
    let caught: unknown;
    try {
      defineAction(unauthorised);
    } catch (error) {
      caught = error;
    } finally {
      Reflect.deleteProperty(Object.prototype, 'roles');
    }
    expect(isIntegrityError(caught)).toBe(true);
    vi.mocked(assertPristineObjectPrototype).mockImplementation(() => {});
    install('roles', ['staff']);
    try {
      expect(() => defineAction(unauthorised)).toThrow(ActionDefinitionError);
    } finally {
      Reflect.deleteProperty(Object.prototype, 'roles');
      vi.mocked(assertPristineObjectPrototype).mockRestore();
    }
    expect(restore).not.toHaveBeenCalled();
  });
});
