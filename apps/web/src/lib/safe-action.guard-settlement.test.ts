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
vi.mock('next/navigation', async importOriginal => importOriginal());

import { isRedirectError } from 'next/dist/client/components/redirect-error';
import { redirect } from 'next/navigation';
import { defineAction } from './safe-action';
import {
  assertPristineObjectPrototype,
  buildInputGuard,
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

describe('synchronous private parsing', () => {
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

  it.each(['redirect', 'union formatter'])(
    'preserves the earlier %s exception by identity before a Promise refinement',
    async kind => {
      const later = vi.fn(() => Promise.resolve(true));
      const { customError } = z.config();
      let thrown: unknown = new Error('union issue formatter failed');
      const handler = vi.fn(async () => 'never');
      const input = z.strictObject({
        claimId: z.string(),
        sibling:
          kind === 'redirect'
            ? z.string().refine(() => {
                try {
                  redirect('/claims');
                } catch (error) {
                  thrown = error;
                  throw error;
                }
              })
            : z.union([z.string(), z.number()]),
        checks: z.array(z.string().refine(later)),
      });
      const raw = { claimId: 'ID-A', checks: ['x'], sibling: kind === 'redirect' ? 'x' : {} };
      if (kind === 'union formatter')
        z.config({
          customError: () => {
            throw thrown;
          },
        });
      try {
        const guarded = await guardFor(input).run(raw, false);
        expect(guarded).toMatchObject({ kind: 'thrown', snapshot: raw });
        expect(guarded.kind === 'thrown' && guarded.error).toBe(thrown);
        const action = defineAction({ ...definition, input, handler });
        if (kind === 'redirect') {
          const error = await action(raw).catch(value => value);
          expect(isRedirectError(error)).toBe(true);
          expect(error).toBe(thrown);
          expect(mocks.capture).not.toHaveBeenCalled();
        } else {
          expect(await action(raw)).toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
          expect(mocks.capture.mock.calls[0]?.[0]).toBe(thrown);
        }
        expect(later).not.toHaveBeenCalled();
        expect(handler).not.toHaveBeenCalled();
        expect(mocks.write).not.toHaveBeenCalled();
      } finally {
        z.config({ customError });
      }
    }
  );

  it.each([true, false])(
    'keeps a thrown integrity error by identity (restored=%s)',
    async restored => {
      const marker = 'duringRefinement';
      let inner: unknown;
      const handler = vi.fn(async () => 'never');
      const action = defineAction({
        ...definition,
        input: z.strictObject({
          claimId: z.string().refine(() => {
            Object.defineProperty(Object.prototype, marker, { configurable: true, value: true });
            try {
              assertPristineObjectPrototype();
            } catch (error) {
              inner = error;
              throw error;
            } finally {
              if (restored) delete (Object.prototype as Record<string, unknown>)[marker];
            }
            return true;
          }),
        }),
        handler,
      });
      let outcome: unknown;
      try {
        outcome = await action({ claimId: 'ID-A' }).catch(error => error);
      } finally {
        delete (Object.prototype as Record<string, unknown>)[marker];
      }
      expect(inner).toBeInstanceOf(ObjectPrototypeIntegrityError);
      expect(outcome).toBe(inner);
      expect(mocks.capture).toHaveBeenCalledTimes(1);
      expect(mocks.capture.mock.calls[0][0]).toBe(inner);
      expect(handler).not.toHaveBeenCalled();
      expect(mocks.write).not.toHaveBeenCalled();
    }
  );

  it('preserves Zod truthiness for a synchronous refinement across concurrent runs', async () => {
    const schema = z.string().refine(value => value.length);
    const input = guardFor(z.strictObject({ field: schema }));
    expect(schema.safeParse('abc').success).toBe(true);
    expect(schema.safeParse('').success).toBe(false);
    const [accepted, refused] = await Promise.all([
      input.run({ field: 'abc' }, false),
      input.run({ field: '' }, false),
    ]);
    expect(accepted).toMatchObject({ kind: 'value', value: { field: 'abc' } });
    expect(refused).toMatchObject({ kind: 'invalid', failure: { issues: { field: 'custom' } } });
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
