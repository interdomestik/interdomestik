import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { ROLE_ADMIN } from './roles.core';
import {
  ActionDefinitionError,
  actionNormalizers,
  defineAction,
  defineFormAction,
} from './safe-action';

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

const inner = z.strictObject({ name: z.string() });
const firstCheck = (schema: z.ZodType) =>
  (schema._zod.def as unknown as { checks: Parameters<z.ZodString['check']> }).checks[0];
// zod's checks take a `when` at run time that their parameter types do not list.
const WITH_WHEN = { when: () => true } as never;

describe('definition: accepted schema forms', () => {
  it('accepts the catalogue form: a strict object with scalar refinements and normalizers', () => {
    const catalogue = z
      .object({
        claimId: z.string().check(actionNormalizers.trim).min(1),
        message: z
          .string()
          .check(actionNormalizers.trim, actionNormalizers.toLowerCase)
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
    [
      'an overwrite on an optional object',
      z.strictObject({ a: inner.optional().overwrite(v => v) }),
    ],
    ['a refine on a nullable object', z.strictObject({ a: inner.nullable().refine(() => true) })],
    ['an overwrite on an array', z.strictObject({ a: z.array(inner).overwrite(v => v) })],
    ['a check on a union', z.strictObject({ a: z.union([inner, z.string()]).check(() => {}) })],
    ['a superRefine on a tuple', z.strictObject({ a: z.tuple([inner]).superRefine(() => {}) })],
  ])('refuses %s', (_label, schema) => {
    expect(define(schema)).toThrow(ActionDefinitionError);
  });

  it('accepts a scalar refinement on an optional, nullable or readonly scalar (r3 B16)', () => {
    const scalarChecks = z.strictObject({
      a: z
        .string()
        .optional()
        .refine(v => v !== ''),
      b: z
        .number()
        .nullable()
        .refine(v => v !== 0),
      c: z.string().check(actionNormalizers.trim).optional().readonly(),
      d: z
        .enum(['x', 'y'])
        .optional()
        .nullable()
        .refine(() => true),
      e: z.string().optional().check(actionNormalizers.normalizeNFC),
    });
    expect(define(scalarChecks)).not.toThrow();
  });

  // Addendum 3 (owner, after Astra r4 B03): zod's own normalisers are overwrite closures that carry
  // no identifying metadata, and superRefine/check callbacks receive a writable payload. Only refine
  // and the wrapper's named normalisers may sit on a scalar.
  it.each([
    ['zod trim', z.string().trim()],
    ['zod toLowerCase', z.string().toLowerCase()],
    ['zod normalize', z.string().normalize()],
    ['an overwrite', z.string().overwrite(v => v)],
    ['a superRefine', z.string().superRefine(() => undefined)],
    ['a check callback', z.number().check(() => undefined)],
    [
      'an overwrite on an optional scalar',
      z
        .string()
        .optional()
        .overwrite(v => v),
    ],
    [
      'a superRefine on a nullable enum',
      z
        .enum(['a'])
        .nullable()
        .superRefine(() => undefined),
    ],
    ['an overwrite on a date', z.date().overwrite(v => v)],
  ])('refuses %s on a scalar field (addendum 3)', (_label, field) => {
    expect(define(z.strictObject({ field }))).toThrow(/field: .*(overwrite|callback)/);
  });

  // Addendum 4 (owner, after Astra r5 B03): every check is judged against an allow-list of kinds
  // that cannot change a value; anything else, and any `when` but zod's default, is refused.
  it.each([
    ['a normalising URL check', z.string().check(z.url({ normalize: true }))],
    [
      'a URL check under another format name',
      z.string().check(z.url({ format: 'email' } as never)),
    ],
    ['a URL field', z.url()],
    ['a refine with a when callback', z.string().refine(() => true, WITH_WHEN)],
    ['a length check with a when callback', z.string().min(1, WITH_WHEN)],
    ['a refine on a date', z.date().refine(() => true)],
    ['an array length check with a when callback', z.array(z.string()).min(1, WITH_WHEN)],
    ['a MIME check outside a file', z.string().check(firstCheck(z.file().mime(['text/plain'])))],
  ])('refuses %s (addendum 4)', (_label, field) => {
    expect(define(z.strictObject({ field }))).toThrow(/input schema refused at field: /);
  });

  it('accepts the value-preserving checks on the allow-list (addendum 4)', () => {
    const allowed = z.strictObject({
      email: z.email(),
      text: z
        .string()
        .min(1)
        .max(9)
        .regex(/^[a-z]+$/u)
        .includes('a')
        .startsWith('a')
        .endsWith('z')
        .lowercase(),
      id: z.string().uuid(),
      at: z.iso.datetime(),
      count: z.number().gt(0).lt(9).multipleOf(1),
      whole: z.int(),
      big: z.bigint().gt(0n),
      when: z.date().min(new Date(0)).max(new Date(1)),
      list: z.array(z.string()).min(1).max(3),
      fixed: z.array(z.string()).length(2),
    });
    expect(define(allowed)).not.toThrow();
  });

  it('the named normalisers cannot be replaced', () => {
    const trim = actionNormalizers.trim as unknown as { _zod: { def: { tx: unknown } } };
    expect(Object.isFrozen(actionNormalizers)).toBe(true);
    expect(Object.isFrozen(trim._zod)).toBe(true);
    expect(() => {
      trim._zod.def.tx = () => ({ userId: 'x' });
    }).toThrow(TypeError);
  });

  it('still refuses a code check on an optional object or array', () => {
    expect(define(z.strictObject({ a: inner.optional().refine(() => true) }))).toThrow(
      /a: a custom check on a optional/
    );
    expect(
      define(
        z.strictObject({
          a: z
            .array(z.string())
            .nullable()
            .check(() => {}),
        })
      )
    ).toThrow(ActionDefinitionError);
  });

  it('refuses an overwrite that adds an owner key after the inner object parsed', () => {
    // The inner strict object passes; the wrapper's overwrite would hand the handler a userId.
    const smuggled = z.strictObject({
      profile: inner.optional().overwrite(value => ({ ...value, userId: 'other' }) as typeof value),
    });
    expect(define(smuggled, { basis: { kind: 'self' } })).toThrow(/profile: a overwrite check/);
  });

  it('refuses a tenant identity key at depth 2 for every basis', () => {
    const nested = z.strictObject({ filter: z.strictObject({ tenantId: z.string() }) });
    expect(define(nested)).toThrow(/filter.tenantId: identity keys/);
  });

  it('refuses an owner column key for a self action, and allows it for a role action', () => {
    const input = z.strictObject({ userId: z.string() });
    expect(define(input, { basis: { kind: 'self' } })).toThrow(/userId: identity keys/);
    expect(define(input)).not.toThrow();
  });

  // Addendum 4 (owner, after Astra r5 B19): a form file carries size and MIME checks only.
  it.each([
    ['an overwrite', z.file().overwrite(file => file)],
    ['a refine', z.file().refine(() => true)],
    ['a check callback', z.file().check(() => undefined)],
    ['a size check with a when callback', z.file().max(9, WITH_WHEN)],
  ])('refuses %s on a form file (r5 B19)', (_label, file) => {
    expect(() =>
      defineFormAction({
        name: 'upload.op',
        basis: { kind: 'role', roles: ADMIN_ONLY },
        input: z.strictObject({ file }),
        subject: { type: 'none' },
        handler,
      })
    ).toThrow(/input schema refused at file: /);
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
