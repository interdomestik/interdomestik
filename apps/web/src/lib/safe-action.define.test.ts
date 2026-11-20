import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { ROLE_ADMIN } from './roles.core';
import { ActionDefinitionError, defineAction, defineFormAction } from './safe-action';

const ADMIN_ONLY = [ROLE_ADMIN] as const;
const handler = () => Promise.resolve('ok');

function define(input: z.ZodType, extra: Record<string, unknown> = {}) {
  return () =>
    defineAction({
      name: 'test.op',
      basis: { kind: 'role', roles: ADMIN_ONLY },
      input,
      subject: { type: 'none' },
      handler,
      ...extra,
    } as never);
}

describe('definition: the public basis is closed in part 1', () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each(['development', 'production', 'test'])(
    'both factories refuse a public basis under NODE_ENV=%s',
    env => {
      vi.stubEnv('NODE_ENV', env);
      const def = {
        name: 'public.op',
        basis: { kind: 'public', entry: 'free-start' },
        input: z.strictObject({}),
        subject: { type: 'none' },
        handler,
      } as const;
      expect(() => defineAction(def)).toThrow(/public intake opens with the PR/);
      expect(() => defineFormAction(def)).toThrow(/public intake opens with the PR/);
    }
  );
});

describe('definition: name, basis, subject', () => {
  it.each([
    ['empty name', { name: '' }],
    ['reserved name', { name: 'legacy' }],
    ['unknown basis', { basis: { kind: 'anyone' } }],
    ['role basis without roles', { basis: { kind: 'role', roles: [] } }],
    ['subject of an unknown type', { subject: { type: 'secret', from: 'id' } }],
    ['subject without a source', { subject: { type: 'claim' } }],
    ['missing handler', { handler: undefined }],
  ])('refuses %s', (_label, extra) => {
    expect(define(z.strictObject({ id: z.string() }), extra)).toThrow(ActionDefinitionError);
  });

  it.each(['user', 'promoter', 'nobody'])(
    'refuses the role %s, which is not in the catalogue (r8 B29)',
    role => {
      const basis = { basis: { kind: 'role', roles: [role] } };
      expect(define(z.strictObject({ id: z.string() }), basis)).toThrow(
        `basis role "${role}" is not in the role catalogue`
      );
    }
  );

  it('accepts the self basis and the self subject', () => {
    const action = defineAction({
      name: 'self.op',
      basis: { kind: 'self' },
      input: z.strictObject({ locale: z.string() }),
      subject: { type: 'self' },
      handler,
    });
    expect(typeof action).toBe('function');
  });

  it('refuses a subject.from that is not a declared top-level key', () => {
    const typo = { subject: { type: 'claim', from: 'claimID' } };
    expect(define(z.strictObject({ claimId: z.string() }), typo)).toThrow(/subject.from "claimID"/);
  });
});

describe('definition: accepted schema forms', () => {
  it('accepts the catalogue form: a strict object with scalar refinements and normalizers', () => {
    const catalogue = z
      .object({
        claimId: z.string().trim().min(1),
        message: z
          .string()
          .trim()
          .toLowerCase()
          .max(2000)
          .refine(value => value.length > 0),
        kind: z.enum(['a', 'b']),
        count: z.int().positive().optional(),
        tags: z.array(z.string()).max(5),
        pair: z.tuple([z.string(), z.number()]),
        choice: z.union([z.literal('x'), z.strictObject({ y: z.boolean() })]),
        when: z.date().nullable().readonly(),
      })
      .strict();
    expect(define(catalogue)).not.toThrow();
  });

  it.each([
    ['a scalar root', z.string()],
    ['a non-strict root', z.object({ a: z.string() })],
    ['a loose object', z.looseObject({ a: z.string() })],
    ['an object refine', z.strictObject({ a: z.string() }).refine(() => true)],
    ['an object check', z.strictObject({ a: z.string() }).check(() => undefined)],
    ['an object superRefine', z.strictObject({ a: z.string() }).superRefine(() => undefined)],
    ['an object overwrite', z.strictObject({ a: z.string() }).overwrite(value => value)],
    ['a transform', z.strictObject({ a: z.string().transform(value => value.length) })],
    ['a pipe', z.strictObject({ a: z.string().pipe(z.string()) })],
    ['a default', z.strictObject({ a: z.string().default('x') })],
    ['a prefault', z.strictObject({ a: z.string().prefault('x') })],
    ['a catch', z.strictObject({ a: z.string().catch('x') })],
    ['unknown', z.strictObject({ a: z.unknown() })],
    ['any', z.strictObject({ a: z.any() })],
    ['a record', z.strictObject({ a: z.record(z.string(), z.string()) })],
    ['a map', z.strictObject({ a: z.map(z.string(), z.string()) })],
    ['a set', z.strictObject({ a: z.set(z.string()) })],
    ['custom', z.strictObject({ a: z.custom<string>() })],
    ['instanceof', z.strictObject({ a: z.instanceof(Date) })],
    ['lazy', z.strictObject({ a: z.lazy(() => z.string()) })],
    ['promise', z.strictObject({ a: z.promise(z.string()) })],
    ['an intersection', z.strictObject({ a: z.intersection(z.string(), z.string()) })],
    ['a tuple with rest', z.strictObject({ a: z.tuple([z.string()]).rest(z.number()) })],
    ['a loose object at depth 2', z.strictObject({ a: z.object({ b: z.string() }) })],
    ['a file outside a form', z.strictObject({ a: z.file() })],
  ])('refuses %s', (_label, schema) => {
    expect(define(schema)).toThrow(ActionDefinitionError);
  });
});

const inner = z.strictObject({ name: z.string() });

// Lead decision after Astra r7 (design addendum 6): part 1 keeps the round-1 refusal. A check on a
// wrapper, array, tuple or union can replace what it holds, so it could add a key the strict object
// did not declare, an identity key included (SEC-02); it belongs in the owning command.
describe('definition: no value-replacing check on a container (addendum 6)', () => {
  it.each([
    [
      'an overwrite on an optional object',
      z.strictObject({ a: inner.optional().overwrite(v => v) }),
    ],
    ['a refine on a nullable object', z.strictObject({ a: inner.nullable().refine(() => true) })],
    ['a check on a readonly object', z.strictObject({ a: inner.readonly().check(() => {}) })],
    [
      'an overwrite on an array of objects',
      z.strictObject({ a: z.array(inner).overwrite(v => v) }),
    ],
    [
      'a refine on an array of strings',
      z.strictObject({ a: z.array(z.string()).refine(() => true) }),
    ],
    ['a superRefine on a tuple', z.strictObject({ a: z.tuple([inner]).superRefine(() => {}) })],
    ['a check on a union', z.strictObject({ a: z.union([inner, z.string()]).check(() => {}) })],
    [
      'an overwrite on a discriminated union',
      z.strictObject({
        a: z.discriminatedUnion('k', [z.strictObject({ k: z.literal('x') })]).overwrite(v => v),
      }),
    ],
    [
      'a check on an array two wrappers deep',
      z.strictObject({
        a: z
          .array(z.string())
          .nullable()
          .optional()
          .check(() => {}),
      }),
    ],
    [
      'an overwrite on an array inside an array',
      z.strictObject({ a: z.array(z.array(inner).overwrite(v => v)) }),
    ],
  ])('refuses %s', (_label, schema) => {
    expect(define(schema)).toThrow(/at a(\[\])?: a (custom|overwrite) check on a /);
  });

  it('refuses an overwrite that adds an owner key after the inner object parsed (SEC-02)', () => {
    const smuggled = z.strictObject({
      profile: inner.optional().overwrite(value => ({ ...value, userId: 'other' }) as typeof value),
    });
    expect(define(smuggled, { basis: { kind: 'self' } })).toThrow(/profile: a overwrite check/);
  });

  it('accepts array size checks and checks on a wrapper around a scalar (r3 B16)', () => {
    const accepted = z.strictObject({
      tags: z.array(z.string()).min(1).max(5).length(3),
      a: z
        .string()
        .optional()
        .refine(v => v !== ''),
      b: z
        .number()
        .nullable()
        .refine(v => v !== 0),
      c: z.string().trim().optional().readonly(),
      d: z
        .enum(['x', 'y'])
        .optional()
        .nullable()
        .refine(() => true),
    });
    expect(define(accepted)).not.toThrow();
  });
});

describe('definition: identity keys and form fields', () => {
  it('refuses a tenant identity key at depth 2 for every basis', () => {
    const nested = z.strictObject({ filter: z.strictObject({ tenantId: z.string() }) });
    expect(define(nested)).toThrow(/filter.tenantId: identity keys/);
  });

  it('refuses an owner column key for a self action, and allows it for a role action', () => {
    const input = z.strictObject({ userId: z.string() });
    expect(define(input, { basis: { kind: 'self' } })).toThrow(/userId: identity keys/);
    expect(define(input)).not.toThrow();
  });

  it('refuses a form field whose union mixes array and non-array branches (r6 B25)', () => {
    const mixed = z.strictObject({ v: z.union([z.string(), z.array(z.string())]).optional() });
    expect(() =>
      defineFormAction({
        name: 'mixed.op',
        basis: { kind: 'role', roles: ADMIN_ONLY },
        input: mixed,
        subject: { type: 'none' },
        handler,
      })
    ).toThrow(/at v: a form field may not mix/);
    expect(define(mixed)).not.toThrow();
  });

  it('accepts a file field in a form action', () => {
    expect(() =>
      defineFormAction({
        name: 'upload.op',
        basis: { kind: 'role', roles: ADMIN_ONLY },
        input: z.strictObject({ file: z.file().min(1).max(9).mime(['text/plain']) }),
        subject: { type: 'none' },
        handler,
      })
    ).not.toThrow();
  });
});
