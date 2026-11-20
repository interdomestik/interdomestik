import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { ROLE_ADMIN } from './roles.core';
import { ActionDefinitionError, defineAction, defineFormAction } from './safe-action';

const ADMIN_ONLY = [ROLE_ADMIN] as const;
const handler = () => Promise.resolve('ok');
const row = z.strictObject({ name: z.string() });
// A developer `when` callback: it receives zod's writable parse payload (Astra r8 B28). zod's types
// declare `when` on refinements only; its size and length checks accept it at run time.
const withWhen = { when: () => true } as never;

function define(input: z.ZodType, form = false) {
  const definition = {
    name: 'when.op',
    basis: { kind: 'role', roles: ADMIN_ONLY },
    input,
    subject: { type: 'none' },
    handler,
  } as const;
  return () => (form ? defineFormAction(definition) : defineAction(definition));
}

// Lead decision after Astra r8 (design addendum 7): a check passes only with zod's own default
// `when`, on any node, at any depth; a custom `when` could change any value the payload reaches.
describe('definition: no check with a custom when callback (addendum 7, r8 B28)', () => {
  it.each([
    ['an array min', z.strictObject({ rows: z.array(row).min(1, withWhen) })],
    ['an array max', z.strictObject({ rows: z.array(row).max(5, withWhen) })],
    ['an array length', z.strictObject({ rows: z.array(row).length(1, withWhen) })],
    [
      'an array min inside a discriminated-union branch',
      z.strictObject({
        v: z.discriminatedUnion('k', [
          z.strictObject({ k: z.literal('a'), rows: z.array(row).min(1, withWhen) }),
        ]),
      }),
    ],
    [
      'an array min inside an optional wrapper',
      z.strictObject({ rows: z.array(row).min(1, withWhen).optional() }),
    ],
    [
      'a refine on a scalar wrapper',
      z.strictObject({
        note: z
          .string()
          .optional()
          .refine(() => true, withWhen),
      }),
    ],
    ['a scalar min', z.strictObject({ note: z.string().min(1, withWhen) })],
    ['a scalar refine', z.strictObject({ note: z.string().refine(() => true, withWhen) })],
    [
      "a check on a strict object's catchall",
      z.strictObject({ a: z.string() }).catchall(z.never().refine(() => true, withWhen)),
    ],
    ['a format field', z.strictObject({ email: z.email(withWhen) })],
  ])('refuses %s with a custom when', (_label, schema) => {
    expect(define(schema)).toThrow(/a check with a custom when callback/);
  });

  it('refuses a file size check with a custom when in a form action', () => {
    const upload = z.strictObject({ file: z.file().max(9, withWhen) });
    expect(define(upload, true)).toThrow(/at file: a check with a custom when callback/);
  });

  it("accepts zod's own default when of size and length checks", () => {
    const sized = z.strictObject({
      rows: z.array(row).min(1).max(5),
      note: z.string().min(1).max(9),
      file: z.file().min(1).max(9),
    });
    expect(define(sized, true)).not.toThrow();
  });
});

// Astra r8 B30: an empty or non-string check kind is an unknown kind, and is refused.
describe('definition: a check of an empty or non-string kind (r8 B30)', () => {
  it.each([
    ['an empty', ''],
    ['a non-string', 42],
  ])('refuses a tuple check of %s kind', (_label, kind) => {
    const tuple = z.tuple([z.string()]).check(() => {});
    const check = (tuple._zod.def.checks ?? [])[0] as { _zod: { def: { check: unknown } } };
    check._zod.def.check = kind;
    expect(define(z.strictObject({ pair: tuple }))).toThrow(ActionDefinitionError);
    expect(define(z.strictObject({ pair: tuple }))).toThrow(/at pair: a unknown check on a tuple/);
  });
});
