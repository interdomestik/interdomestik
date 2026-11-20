import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { ROLE_ADMIN } from './roles.core';
import { actionNormalizers, defineAction, defineFormAction } from './safe-action';

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

const firstCheck = (schema: z.ZodType) =>
  (schema._zod.def as unknown as { checks: Parameters<z.ZodString['check']> }).checks[0];
// zod's checks take a `when` at run time that their parameter types do not list.
const WITH_WHEN = { when: () => true } as never;

// The check allow-list (safe-action.checks.ts), moved unchanged from safe-action.define.test.ts.
describe('definition: accepted schema forms', () => {
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

  // Lead decision on Astra r6 B20: zod reads an omitted key's inherited member from a plain input.
  it.each(Object.getOwnPropertyNames(Object.prototype))(
    'refuses a key named like the Object.prototype member %s, at any depth (r6 B20)',
    key => {
      const field = Object.fromEntries([[key, z.string().optional()]]);
      expect(define(z.strictObject(field))).toThrow(`at ${key}: a key named like`);
      const nested = z.strictObject({ outer: z.array(z.strictObject(field)) });
      expect(define(nested)).toThrow(`at outer[].${key}: a key named like`);
    }
  );

  it('the named normalisers cannot be replaced', () => {
    const trim = actionNormalizers.trim as unknown as { _zod: { def: { tx: unknown } } };
    expect(Object.isFrozen(actionNormalizers)).toBe(true);
    expect(Object.isFrozen(trim._zod)).toBe(true);
    expect(() => {
      trim._zod.def.tx = () => ({ userId: 'x' });
    }).toThrow(TypeError);
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
});
