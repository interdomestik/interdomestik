// @vitest-environment node
import { runInNewContext } from 'node:vm';
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
vi.mock('next/navigation', async importOriginal => importOriginal());

import { redirect } from 'next/navigation';
import { ActionDefinitionError, defineAction } from './safe-action';
import { buildInputGuard, ObjectPrototypeIntegrityError } from './safe-action.guard';
import { REFUSAL_CODES } from './safe-action.types';

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

describe('async parsing defects', () => {
  it('refuses a bound async refinement at definition with the named reason', () => {
    const checks = {
      async allowed(value: string) {
        return value.length > 0;
      },
    };
    const input = z.strictObject({ field: z.string().refine(checks.allowed.bind(checks)) });
    expect(() => guardFor(input)).toThrow(ActionDefinitionError);
    expect(() => guardFor(input)).toThrow(/async refinements are not supported/);
  });

  it.each([
    ['native Promise', () => Promise.resolve(true)],
    ['foreign-realm Promise', () => runInNewContext('Promise.resolve(false)') as unknown],
    ['Promise with no then property', () => Object.setPrototypeOf(Promise.resolve(true), null)],
    ['plain thenable', (then: () => void) => ({ then })],
    ['inherited thenable', (then: () => void) => Object.create({ then }) as unknown],
    ['noncallable then', () => ({ then: undefined })],
    [
      'inherited then getter',
      (get: () => void) => Object.create(Object.defineProperty({}, 'then', { get })) as unknown,
    ],
    [
      'Promise subclass with a then getter',
      (read: () => void) => {
        class GetterPromise extends Promise<boolean> {}
        Object.defineProperty(GetterPromise.prototype, 'then', {
          get() {
            read();
            return Promise.prototype.then;
          },
        });
        return new GetterPromise(resolve => resolve(false));
      },
    ],
    [
      'proxy with no then property',
      (trap: () => never) =>
        new Proxy({}, { get: trap, getOwnPropertyDescriptor: trap, getPrototypeOf: trap }),
    ],
  ] as const)(
    'fails closed for a sync refinement result of type %s without reading then',
    async (_kind, create) => {
      const inspect = vi.fn((): never => {
        throw new Error('unexpected inspection');
      });
      const answer = create(inspect);
      const input = z.strictObject({ claimId: z.string().refine(() => answer) });
      const raw = { claimId: 'ID-A' };
      expect.soft(await guardFor(input).run(raw, false)).toEqual({
        kind: 'defect',
        reason: 'thenable_refinement',
        snapshot: raw,
      });
      const handler = vi.fn(async () => 'never');
      const action = defineAction({ ...definition, input, handler });
      expect(await action(raw)).toMatchObject({ success: false, code: 'INTERNAL_SERVER_ERROR' });
      expect(mocks.capture).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ message: 'Safe action contract violation' }),
        { extra: { operation: definition.name, reason: 'thenable_refinement' } }
      );
      expect(JSON.stringify(mocks.capture.mock.calls)).not.toContain(raw.claimId);
      expect(mocks.capture.mock.calls[0][0].stack).not.toContain(raw.claimId);
      expect(inspect).not.toHaveBeenCalled();
      expect(handler).not.toHaveBeenCalled();
      expect(mocks.write).not.toHaveBeenCalled();
    }
  );

  it.each([...REFUSAL_CODES, 'NOT_FOUND', 'CONFLICT'])(
    'stops before a later refinement that would throw %s',
    async code => {
      const later = vi.fn(() => {
        throw Object.assign(new Error('denied'), { code });
      });
      const handler = vi.fn(async () => 'never');
      const input = z.strictObject({
        claimId: z
          .string()
          .refine(() => Promise.resolve(true))
          .refine(later),
      });
      const action = defineAction({ ...definition, input, handler });
      expect.soft(await action({ claimId: 'ID-A' })).toMatchObject({
        success: false,
        code: 'INTERNAL_SERVER_ERROR',
      });
      expect.soft(later).not.toHaveBeenCalled();
      expect.soft(mocks.write).not.toHaveBeenCalled();
      expect(handler).not.toHaveBeenCalled();
    }
  );

  it('maps a Zod async parse error to a defect and captures it once without input', async () => {
    const asyncSchema = z.string().refine(async () => true);
    expect(() => asyncSchema.safeParse('x')).toThrow(z.core.$ZodAsyncError);
    const input = z.strictObject({
      claimId: z.string().refine(value => asyncSchema.safeParse(value).success),
    });
    const raw = { claimId: 'ID-A' };
    expect.soft(await guardFor(input).run(raw, false)).toEqual({
      kind: 'defect',
      reason: 'async_parse',
      snapshot: raw,
    });
    const handler = vi.fn(async () => 'never');
    const action = defineAction({ ...definition, input, handler });
    expect(await action(raw)).toMatchObject({ success: false, code: 'INTERNAL_SERVER_ERROR' });
    expect(mocks.capture).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ message: 'Safe action contract violation' }),
      { extra: { operation: definition.name, reason: 'async_parse' } }
    );
    expect(JSON.stringify(mocks.capture.mock.calls)).not.toContain(raw.claimId);
    expect(mocks.capture.mock.calls[0][0].stack).not.toContain(raw.claimId);
    expect(handler).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it('stops before a sibling redirect after a refinement returns a rejected Promise', async () => {
    const denial = Promise.reject(Object.assign(new Error('denied'), { code: 'FORBIDDEN' }));
    // The predicate owns the rejection and the guard must never adopt the Promise.
    void denial.catch(() => {});
    const later = vi.fn(() => redirect('/claims'));
    const handler = vi.fn(async () => 'never');
    const input = z.strictObject({
      claimId: z.string(),
      checks: z.array(z.string().refine(() => denial)),
      sibling: z.string().refine(later),
    });
    const action = defineAction({ ...definition, input, handler });
    const outcome = await action({ claimId: 'ID-A', checks: ['x'], sibling: 'x' }).catch(
      error => error
    );
    expect.soft(outcome).toMatchObject({ success: false, code: 'INTERNAL_SERVER_ERROR' });
    expect(later).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it('rethrows the integrity gate error when a predicate returns a Promise', async () => {
    const marker = 'duringThenableRefinement';
    const later = vi.fn(() => true);
    const handler = vi.fn(async () => 'never');
    const input = z.strictObject({
      claimId: z
        .string()
        .refine(() => {
          Object.defineProperty(Object.prototype, marker, { configurable: true, value: true });
          return Promise.resolve(true);
        })
        .refine(later),
    });
    const action = defineAction({ ...definition, input, handler });
    let outcome: unknown;
    try {
      outcome = await action({ claimId: 'ID-A' }).catch(error => error);
    } finally {
      delete (Object.prototype as Record<string, unknown>)[marker];
    }
    expect(outcome).toBeInstanceOf(ObjectPrototypeIntegrityError);
    expect(mocks.capture).toHaveBeenCalledOnce();
    expect(mocks.capture.mock.calls[0][0]).toBe(outcome);
    expect(later).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it('keeps a refinement defect local to its run', async () => {
    const input = guardFor(
      z.strictObject({
        field: z.string().refine(value => (value === 'bad' ? Promise.resolve(true) : true)),
      })
    );
    const [defective, accepted] = await Promise.all([
      input.run({ field: 'bad' }, false),
      input.run({ field: 'ok' }, false),
    ]);
    expect(defective).toMatchObject({ kind: 'defect' });
    expect(accepted).toMatchObject({ kind: 'value' });
  });
});
