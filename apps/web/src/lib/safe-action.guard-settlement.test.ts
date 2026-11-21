// @vitest-environment node
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

import { defineAction } from './safe-action';
import {
  assertPristineObjectPrototype,
  buildInputGuard,
  isIntegrityError,
  ObjectPrototypeIntegrityError,
} from './safe-action.guard';

const definition = {
  name: 'guard.settlement',
  basis: { kind: 'role', roles: ['staff'] },
  subject: { type: 'claim', from: 'claimId' },
} as const;

const guardFor = (input: z.ZodType) =>
  buildInputGuard(input, {
    operation: definition.name,
    basisKind: 'role',
    form: false,
    subjectFrom: null,
  });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.authorize.mockResolvedValue(authorizedSession(STAFF_A));
  mocks.write.mockResolvedValue({ ok: true });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((fulfil, fail) => {
    resolve = fulfil;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe('private parser settlement', () => {
  it('rejects a fractional input before the access refinement or refusal audit', async () => {
    const checkAccess = vi.fn(() => {
      throw Object.assign(new Error('denied'), { code: 'FORBIDDEN' });
    });
    const number = z
      .number()
      .refine(() => true)
      .int()
      .refine(checkAccess);
    expect(number.safeParse(1.5).success).toBe(false);
    expect(checkAccess).not.toHaveBeenCalled();
    const handler = vi.fn(async () => 'never');
    const action = defineAction({
      ...definition,
      input: z.strictObject({ claimId: z.string(), number }),
      handler,
    });
    expect(await action({ claimId: 'ID-A', number: 1.5 })).toMatchObject({
      code: 'VALIDATION_ERROR',
      issues: { number: 'invalid_type' },
    });
    expect(checkAccess).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it.each([true, false])(
    'keeps a sibling integrity error ahead of an ordinary denial (restored=%s)',
    async restored => {
      const marker = 'duringSiblingRefinement';
      let inner: unknown;
      const handler = vi.fn(async () => 'never');
      const action = defineAction({
        ...definition,
        input: z.strictObject({
          claimId: z.string().refine(() => {
            throw Object.assign(new Error('denied'), { code: 'FORBIDDEN' });
          }),
          note: z.string().refine(async () => {
            await Promise.resolve();
            Object.defineProperty(Object.prototype, marker, { configurable: true, value: true });
            try {
              assertPristineObjectPrototype();
            } catch (error) {
              inner = error;
              throw error;
            } finally {
              if (restored) Reflect.deleteProperty(Object.prototype, marker);
            }
          }),
        }),
        handler,
      });
      let outcome: unknown;
      try {
        outcome = await action({ claimId: 'ID-A', note: 'note' }).catch(error => error);
      } finally {
        Reflect.deleteProperty(Object.prototype, marker);
      }
      expect(inner).toBeInstanceOf(ObjectPrototypeIntegrityError);
      expect(outcome).toBe(inner);
      expect(mocks.capture).toHaveBeenCalledTimes(1);
      expect(mocks.capture.mock.calls[0][0]).toBe(inner);
      expect(handler).not.toHaveBeenCalled();
      expect(mocks.write).not.toHaveBeenCalled();
    }
  );

  it('drains a started refinement when Zod throws while building a sibling union issue', async () => {
    const slow = deferred<boolean>();
    const started = deferred<void>();
    const settled = vi.fn();
    const error = new Error('union issue formatter failed');
    const guard = guardFor(
      z.strictObject({
        slow: z.string().refine(() => {
          started.resolve();
          return slow.promise;
        }),
        union: z.union([z.string(), z.number()]),
      })
    );
    const { customError } = z.config();
    const formatter = vi.fn(() => {
      throw error;
    });
    z.config({ customError: formatter });
    const raw = { slow: 'x', union: {} };
    const run = guard.run(raw, false);
    void run.then(settled, settled);
    try {
      await started.promise;
      await new Promise<void>(resolve => setImmediate(resolve));
      expect(formatter).toHaveBeenCalledOnce();
      expect(settled).not.toHaveBeenCalled();
    } finally {
      slow.reject(new Error('later refinement failed'));
      z.config({ customError });
    }
    const result = await run;
    expect(result).toMatchObject({ kind: 'thrown', snapshot: raw });
    expect(result.kind === 'thrown' && result.error).toBe(error);
  });

  it('does not start a follow-on refinement after its parse has already failed', async () => {
    const slow = deferred<boolean>();
    const followOn = vi.fn(() => true);
    const guard = guardFor(
      z.strictObject({
        slow: z
          .string()
          .refine(() => slow.promise)
          .optional()
          .refine(followOn),
        union: z.union([z.string(), z.number()]),
      })
    );
    const { customError } = z.config();
    const error = new Error('parser failed');
    const failed = deferred<void>();
    z.config({
      customError: () => {
        failed.resolve();
        throw error;
      },
    });
    try {
      const run = guard.run({ slow: 'x', union: {} }, false);
      await failed.promise;
      slow.resolve(true);
      expect(await run).toMatchObject({ kind: 'thrown', error });
      await new Promise<void>(resolve => setImmediate(resolve));
      expect(followOn).not.toHaveBeenCalled();
    } finally {
      z.config({ customError });
    }
  });

  it.each([false, true])(
    'gates a refinement settlement before the outer parse can see restoration (rejected=%s)',
    async rejected => {
      const pending = deferred<boolean>();
      const started = deferred<void>();
      const marker = 'duringRefinementSettlement';
      const guard = guardFor(
        z.strictObject({
          field: z.string().refine(() => {
            started.resolve();
            return pending.promise;
          }),
        })
      );
      const run = guard.run({ field: 'x' }, false).catch(error => error);
      await started.promise;
      Object.defineProperty(Object.prototype, marker, { configurable: true, value: true });
      if (rejected) pending.reject(new Error('refinement rejected'));
      else pending.resolve(true);
      queueMicrotask(() => Reflect.deleteProperty(Object.prototype, marker));
      const result: unknown = await run;
      expect(Object.hasOwn(Object.prototype, marker)).toBe(false);
      expect(isIntegrityError(result)).toBe(true);
    }
  );

  it.each([
    ['synchronous', (value: string) => value.length],
    ['asynchronous', async (value: string) => value.length],
  ])('preserves Zod truthiness for a %s refinement across concurrent runs', async (_kind, fn) => {
    const schema = z.string().refine(fn);
    const input = guardFor(z.strictObject({ field: schema }));
    expect((await schema.safeParseAsync('abc')).success).toBe(true);
    expect((await schema.safeParseAsync('')).success).toBe(false);
    const [accepted, refused] = await Promise.all([
      input.run({ field: 'abc' }, false),
      input.run({ field: '' }, false),
    ]);
    expect(accepted).toMatchObject({ kind: 'value', value: { field: 'abc' } });
    expect(refused).toMatchObject({ kind: 'invalid', failure: { issues: { field: 'custom' } } });
  });

  it('adopts an inherited data then with the original receiver and skips an accessor then', async () => {
    const then = vi.fn((resolve: (value: unknown) => void) => resolve(false));
    const value = Object.create({ then });
    const pending = guardFor(z.strictObject({ field: z.string().refine(() => value) }));
    expect(await pending.run({ field: 'x' }, false)).toMatchObject({
      kind: 'invalid',
      failure: { issues: { field: 'custom' } },
    });
    expect(then).toHaveBeenCalledOnce();
    expect(then.mock.contexts[0]).toBe(value);

    const getter = vi.fn(() => then);
    Object.defineProperty(value, 'then', { get: getter });
    expect(await pending.run({ field: 'x' }, false)).toMatchObject({ kind: 'value' });
    expect(getter).not.toHaveBeenCalled();
    expect(then).toHaveBeenCalledOnce();
  });

  it.each([
    ['string', z.string(), 'invalid_type'],
    ['union', z.union([z.string(), z.number()]), 'invalid_union'],
  ])(
    'reports malformed constructor data as a validation issue for a %s',
    async (_kind, schema, code) => {
      const raw = { field: { constructor: { name: {} } } };
      const input = z.strictObject({ field: schema });
      expect(input.safeParse(raw).error?.issues[0].code).toBe(code);
      expect(await guardFor(input).run(raw, false)).toMatchObject({
        kind: 'invalid',
        failure: { issues: { field: code } },
        snapshot: raw,
      });
    }
  );

  it.each([
    ['customError', 1],
    ['customError', { constructor: { name: {} } }],
    ['localeError', { constructor: { name: {} } }],
  ] as const)('returns a configured %s exception by identity (%#)', async (key, field) => {
    const guard = guardFor(z.strictObject({ field: z.string() }));
    const prior = z.config()[key];
    const error = new Error('configured formatter failed');
    const formatter = vi.fn(() => {
      throw error;
    });
    z.config({ [key]: formatter });
    try {
      const result = await guard.run({ field }, false);
      expect(formatter).toHaveBeenCalledOnce();
      expect(result).toMatchObject({ kind: 'thrown', snapshot: { field } });
      expect(result.kind === 'thrown' && result.error).toBe(error);
    } finally {
      z.config({ [key]: prior });
    }
  });
});
