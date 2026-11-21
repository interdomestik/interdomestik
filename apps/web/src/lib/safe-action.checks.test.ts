import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { actionNormalizers, ActionDefinitionError } from './safe-action';
import { buildInputGuard } from './safe-action.guard';
import { rebuildCheck } from './safe-action.checks';

const guard = (field: z.ZodType) =>
  buildInputGuard(z.strictObject({ field }), {
    operation: 'guard.checks',
    basisKind: 'role',
    form: false,
    subjectFrom: null,
  });

describe('private admitted Zod checks', () => {
  it.each([
    ['string length', z.string().min(2).max(3).length(2), 'ab', 'abc'],
    ['integer format', z.int().positive().optional(), 2, 1.5],
    ['bigint format and comparison', z.int64().gte(0n).multipleOf(2n), 2n, -1n],
    ['a built-in length check on an enum', z.enum(['A', 'AB']).check(z.minLength(2)), 'AB', 'A'],
    ['a built-in comparison on a literal', z.literal([1, 2]).check(z.gt(1)), 2, 1],
    ['Date coercion from a primitive', z.coerce.date().min(new Date(1)), 100, new Date(100)],
    ['email format', z.email(), 'user@example.test', 'example'],
    ['UUID format', z.uuid(), '123e4567-e89b-12d3-a456-426614174000', 'uuid'],
    ['explicit lowercase pattern', z.string().check(z.lowercase({ pattern: /^a+$/ })), 'aa', 'bb'],
    ['uppercase and regex', z.string().check(z.uppercase(), z.regex(/^A/)), 'AB', 'Ab'],
    ['array length', z.array(z.string()).min(1).max(2).length(1), ['a'], []],
    ['Date comparisons', z.date().min(new Date(1)).max(new Date(4)), new Date(1), new Date(0)],
  ])('preserves %s', async (_kind, schema, accepted, refused) => {
    const input = guard(schema);
    expect(await input.run({ field: accepted }, false)).toMatchObject({ kind: 'value' });
    expect(await input.run({ field: refused }, false)).toMatchObject({ kind: 'invalid' });
  });

  it.each([
    ['includes', 'ac'],
    ['startsWith', 'xbc'],
    ['endsWith', 'abx'],
  ])('independently enforces %s in a chain of string operands', async (_kind, refused) => {
    const input = guard(z.string().includes('b').startsWith('a').endsWith('c'));
    expect(await input.run({ field: 'abc' }, false)).toMatchObject({ kind: 'value' });
    expect(await input.run({ field: refused }, false)).toMatchObject({
      kind: 'invalid',
      failure: { issues: { field: 'invalid_format' } },
    });
  });

  it.each([
    ['arbitrary overwrite', z.string().overwrite(value => value)],
    ['anonymous trim', z.string().trim()],
    ['superRefine', z.string().superRefine(() => {})],
    ['custom check', z.string().check(() => {})],
    ['URL', z.url()],
    ['normalising URL', z.url({ normalize: true })],
    ['URL with renamed format', z.url().clone({ ...z.url()._zod.def, format: 'email' } as never)],
    ['custom format named email', z.stringFormat('email', /^.+$/)],
    ['positioned includes', z.string().includes('x', { position: 1 })],
    ['minimum with abort', z.string().min(1, { abort: true } as never)],
    ['refine with abort', z.string().refine(() => true, { abort: true })],
    ['refine with path', z.string().refine(() => true, { path: ['x'] })],
    ['refine with params', z.string().refine(() => true, { params: {} } as never)],
    ['refine with when', z.string().refine(() => true, { when: () => true })],
    ['Date refine', z.date().refine(() => true)],
    [
      'enum refine',
      z
        .enum(['draft'])
        .nullable()
        .refine(() => true),
    ],
    ['literal refine', z.literal('A').refine(() => true)],
    ['literal normaliser', z.literal('A').check(actionNormalizers.toLowerCase as never)],
    ['xor', z.xor([z.string(), z.number()])],
    ['coercion inside a union', z.union([z.coerce.number(), z.boolean()])],
    [
      'checked literal branches of the same kind',
      z.union([z.literal('A').check(z.minLength(1)), z.literal('B')]),
    ],
    ['two checked string branches', z.union([z.string().min(1), z.string().max(3)])],
    [
      'two plain object branches',
      z.union([z.strictObject({ a: z.string() }), z.strictObject({ b: z.string() })]),
    ],
    ['checked never catchall', z.strictObject({}).catchall(z.never().refine(() => true))],
  ])('refuses %s at definition', (_kind, schema) => {
    expect(() => guard(schema)).toThrow(ActionDefinitionError);
  });

  it('refuses a normalised discriminator and preserves disjoint literal dispatch', async () => {
    const one = z.strictObject({ tag: z.literal('A'), a: z.string() });
    const two = z.strictObject({ tag: z.enum(['B', 'C']), b: z.number() });
    const bad = z.strictObject({
      tag: z.literal('A').check(actionNormalizers.toLowerCase as never),
    });
    expect(() => guard(z.discriminatedUnion('tag', [bad, two]))).toThrow(ActionDefinitionError);
    const union = guard(z.discriminatedUnion('tag', [one, two]));
    expect(await union.run({ field: { tag: 'C', b: 3 } }, false)).toMatchObject({
      kind: 'value',
      value: { field: { tag: 'C', b: 3 } },
    });
    expect(await union.run({ field: { tag: 'C', a: 'x' } }, false)).toMatchObject({
      kind: 'invalid',
    });
  });

  it('refuses a discriminated union with unionFallback at definition', () => {
    const a = z.strictObject({ tag: z.literal('A') });
    const b = z.strictObject({ tag: z.literal('B') });
    expect(() => guard(z.discriminatedUnion('tag', [a, b], { unionFallback: true }))).toThrow(
      /unionFallback/
    );
  });

  it.each(['field', 'discriminator'])('refuses a hidden enum entry on a %s', position => {
    const entries = Object.defineProperty({ public: 'public' }, 'internal', {
      value: 'internal',
    });
    const tag = z.enum(entries);
    const field =
      position === 'field'
        ? tag
        : z.discriminatedUnion('tag', [
            z.strictObject({ tag }),
            z.strictObject({ tag: z.literal('other') }),
          ]);
    expect(field.safeParse(position === 'field' ? 'internal' : { tag: 'internal' }).success).toBe(
      false
    );
    expect(() => guard(field)).toThrow(/invalid enum entry/);
  });

  it('refuses a never catchall with an own empty checks entry (B26)', () => {
    const catchall = z.never().check();
    expect(Object.hasOwn(catchall._zod.def, 'checks')).toBe(true);
    expect(catchall._zod.def.checks).toEqual([]);
    expect(() => guard(z.strictObject({}).catchall(catchall))).toThrow(ActionDefinitionError);
  });

  it('rebuilds from metadata even when the developer parser still runs a removed trim', async () => {
    const field = z.string().trim();
    field._zod.def.checks?.splice(0);
    expect(field.parse(' x ')).toBe('x');
    const input = guard(field);
    field._zod.def.checks?.push(z.overwrite(() => ({ extra: true })) as never);
    expect(await input.run({ field: ' x ' }, false)).toMatchObject({
      kind: 'value',
      value: { field: ' x ' },
    });
  });

  it('ignores a replaced length when while keeping the minimum', async () => {
    const when = vi.fn(() => false);
    const input = guard(z.string().min(2, { when } as never));
    expect(await input.run({ field: 'a' }, false)).toMatchObject({ kind: 'invalid' });
    expect(await input.run({ field: 'ab' }, false)).toMatchObject({ kind: 'value' });
    expect(when).not.toHaveBeenCalled();
  });

  it.each([
    ['string', z.string().min(2), { length: {} }, false],
    ['array', z.array(z.string()).max(2), { length: {} }, false],
    ['File', z.file().check(z.size(2)), { size: {} }, true],
  ])('reports invalid_type before measuring a malformed %s', async (_label, field, value, form) => {
    const input = buildInputGuard(z.strictObject({ field }), {
      operation: 'guard.checks',
      basisKind: 'role',
      subjectFrom: null,
      form,
    });
    expect(await input.run({ field: value }, false)).toMatchObject({
      kind: 'invalid',
      failure: { issues: { field: 'invalid_type' } },
    });
  });

  it.each([
    z.union([
      z
        .string()
        .optional()
        .refine(() => true),
      z.literal(undefined),
    ]),
    z.union([
      z.union([
        z
          .string()
          .nullable()
          .refine(() => true),
        z.boolean(),
      ]),
      z.literal(null),
    ]),
    z.union([
      z.strictObject({
        field: z
          .string()
          .optional()
          .refine(() => true),
      }),
      z.date(),
    ]),
  ])(
    'refuses overlapping refined branches reached via literals, nested unions or Dates (%#)',
    field => {
      expect(() => guard(field)).toThrow(/overlapping branches and a refinement/);
    }
  );

  it('admits disjoint refined branches and unchecked branches sharing null', async () => {
    const refine = vi.fn(() => true);
    const disjoint = guard(z.union([z.string().nullable().refine(refine), z.number()]));
    expect(await disjoint.run({ field: null }, false)).toMatchObject({ kind: 'value' });
    expect(refine).toHaveBeenCalledExactlyOnceWith(null);
    const unchecked = guard(z.union([z.string().nullable(), z.number().nullable()]));
    expect(await unchecked.run({ field: null }, false)).toMatchObject({ kind: 'value' });
    const nested = z.union([z.date(), z.strictObject({ field: z.string() })]);
    const disjointNested = guard(z.union([nested, z.string().refine(refine)]));
    expect(await disjointNested.run({ field: new Date(1) }, false)).toMatchObject({
      kind: 'value',
    });
  });

  it.each([
    ['trim', ' a ', 'a'],
    ['toLowerCase', 'A', 'a'],
    ['toUpperCase', 'a', 'A'],
    ['normalizeNFC', 'e\u0301', 'é'],
    ['normalizeNFKC', 'Ａ', 'A'],
  ] as const)('applies the private %s normaliser', async (kind, value, expected) => {
    const input = guard(z.string().check(actionNormalizers[kind]));
    expect(await input.run({ field: value }, false)).toMatchObject({
      kind: 'value',
      value: { field: expected },
    });
  });

  it('keeps check order across a length check and normalisers', async () => {
    const input = guard(
      z.string().min(3).check(actionNormalizers.trim, actionNormalizers.toLowerCase)
    );
    expect(await input.run({ field: ' A ' }, false)).toMatchObject({
      kind: 'value',
      value: { field: 'a' },
    });
  });

  it('keeps a private copy of a Date bound', async () => {
    const minimum = new Date(100);
    const input = guard(z.date().min(minimum));
    minimum.setTime(0);
    expect(await input.run({ field: new Date(50) }, false)).toMatchObject({ kind: 'invalid' });
  });

  it('refines without a receiver and sees the normalised string and signed zero', async () => {
    const observe = vi.fn(function (this: undefined, _value: unknown) {
      expect(this).toBeUndefined();
      return true;
    });
    const text = guard(z.string().check(actionNormalizers.toLowerCase).refine(observe));
    const number = guard(z.number().refine(observe));
    expect(await text.run({ field: 'A' }, false)).toMatchObject({ kind: 'value' });
    expect(await number.run({ field: -0 }, false)).toMatchObject({ kind: 'value' });
    expect(observe.mock.calls).toEqual([['a'], [-0]]);
  });

  it('allows null or undefined when a wrapper declares the refine domain', async () => {
    const nullable = guard(
      z
        .number()
        .nullable()
        .refine(value => value !== 0)
    );
    const optional = guard(
      z
        .string()
        .optional()
        .refine(value => value === undefined)
    );
    expect(await nullable.run({ field: null }, false)).toMatchObject({ kind: 'value' });
    expect(await nullable.run({ field: 0 }, false)).toMatchObject({ kind: 'invalid' });
    expect(await optional.run({ field: undefined }, false)).toMatchObject({ kind: 'value' });
  });

  it('never calls a string predicate with an object, including through the installed adapter', async () => {
    const predicate = vi.fn(() => true);
    const check = rebuildCheck([
      'custom',
      { type: 'string', nullable: false, optional: false },
      predicate,
    ]);
    const wrongType = { value: { a: 'x' }, issues: [] };
    check._zod.check(wrongType as never);
    expect(wrongType.issues).toHaveLength(1);
    const input = guard(z.union([z.string().refine(predicate), z.strictObject({ a: z.string() })]));
    expect(await input.run({ field: { a: 'x' } }, false)).toMatchObject({ kind: 'value' });
    expect(predicate).not.toHaveBeenCalled();
  });
});
