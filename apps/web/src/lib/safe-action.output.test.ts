// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { exactParsedInput } from './safe-action.output';

const exact = (schema: z.ZodType, value: unknown) => exactParsedInput(schema, value, 'op');
const accepts = (schema: z.ZodType, input: unknown) => () => exact(schema, schema.parse(input));
const refuses = (schema: z.ZodType, value: unknown) => () => exact(schema, value);

describe('the parsed value has exactly the declared shape (r3 B03)', () => {
  it('an enum or literal value must be one of the declared values', () => {
    const schema = z.strictObject({ kind: z.enum(['a', 'b']), fixed: z.literal('x') });
    expect(refuses(schema, { kind: 1, fixed: 'x' })).toThrow(/declared shape/);
    expect(refuses(schema, { kind: 'a', fixed: 'y' })).toThrow(/declared shape/);
    expect(accepts(schema, { kind: 'b', fixed: 'x' })).not.toThrow();
  });

  it('a Date, a file, an array or an object may carry no extra own key', () => {
    const owner = { userId: 'other' };
    const schema = z.strictObject({
      when: z.date(),
      tags: z.array(z.string()),
      pair: z.tuple([z.string()]),
    });
    const ok = { when: new Date(0), tags: ['a'], pair: ['p'] };
    expect(accepts(schema, ok)).not.toThrow();
    expect(refuses(schema, { ...ok, when: Object.assign(new Date(0), owner) })).toThrow();
    expect(refuses(schema, { ...ok, tags: Object.assign(['a'], owner) })).toThrow();
    expect(refuses(schema, { ...ok, pair: Object.assign(['p'], owner) })).toThrow();
    expect(refuses(schema, { ...ok, extra: 1 })).toThrow();
    const form = z.strictObject({ file: z.file() });
    const file = new File(['x'], 'x.txt');
    expect(accepts(form, { file })).not.toThrow();
    expect(refuses(form, { file: Object.assign(new File(['x'], 'x.txt'), owner) })).toThrow();
  });

  it('a scalar position holds a value of its own type', () => {
    const schema = z.strictObject({ n: z.number(), b: z.boolean(), s: z.string() });
    expect(refuses(schema, { n: '1', b: true, s: 's' })).toThrow();
    expect(refuses(schema, { n: 1, b: 'true', s: 's' })).toThrow();
    expect(refuses(schema, { n: 1, b: true, s: { userId: 'x' } })).toThrow();
  });
});

enum Status {
  Open,
  Closed,
}

describe('round-4 variants (r4 B03)', () => {
  it("a numeric enum's reverse label is not one of its values", () => {
    const schema = z.strictObject({ status: z.enum(Status) });
    expect(accepts(schema, { status: Status.Open })).not.toThrow();
    expect(refuses(schema, { status: 'Open' })).toThrow(/declared shape/);
    expect(refuses(schema, { status: '0' })).toThrow(/declared shape/);
  });

  it('an object with the Date prototype that is not a real Date, or an invalid Date', () => {
    const schema = z.strictObject({ when: z.date() });
    expect(refuses(schema, { when: Object.create(Date.prototype) })).toThrow(/declared shape/);
    expect(refuses(schema, { when: new Date(Number.NaN) })).toThrow(/declared shape/);
    const tagged = Object.assign(Object.create(Date.prototype), {
      [Symbol.toStringTag]: 'Date',
    });
    expect(refuses(schema, { when: tagged })).toThrow(/declared shape/);
  });

  it('a sparse array whose extra named key balances the key count', () => {
    const sparse = Object.assign(['x', 'y'], { userId: 'other' });
    delete sparse[1];
    const schema = z.strictObject({ value: z.union([z.string(), z.array(z.string())]) });
    expect(Reflect.ownKeys(sparse)).toHaveLength(sparse.length + 1);
    expect(refuses(schema, { value: sparse })).toThrow(/declared shape/);
    expect(refuses(schema, { value: Object.assign(['x'], { [Symbol('k')]: 1 }) })).toThrow();
  });
});

describe('the shape check accepts every value zod can legitimately produce (r3 B14)', () => {
  it('an omitted optional key, also one named like an Object.prototype member', () => {
    const schema = z.strictObject({
      toString: z.string().optional(),
      constructor: z.number().optional(),
      note: z.string().optional(),
    });
    // zod reads the inherited member of a plain input, so it refuses a plain `{}`. A null-prototype
    // input parses, and zod's output is a plain object whose `toString` is inherited (r5 B20): the
    // copy the handler receives has neither a prototype nor the omitted keys.
    expect(schema.safeParse({}).success).toBe(false);
    const parsed = schema.parse(Object.create(null));
    expect(typeof parsed.toString).toBe('function');
    const copy = exact(schema, parsed) as Record<string, unknown>;
    expect(Object.getPrototypeOf(copy)).toBeNull();
    expect(Reflect.ownKeys(copy)).toEqual([]);
    expect(copy.toString).toBeUndefined();
    expect(copy.constructor).toBeUndefined();
    expect(accepts(schema, { toString: 's', constructor: 1 })).not.toThrow();
  });

  it('a tuple without its optional trailing items', () => {
    const schema = z.strictObject({ pair: z.tuple([z.string(), z.number().optional()]) });
    expect(accepts(schema, { pair: ['a'] })).not.toThrow();
    expect(accepts(schema, { pair: ['a', 2] })).not.toThrow();
    expect(refuses(schema, { pair: [] })).toThrow();
    expect(refuses(schema, { pair: ['a', 2, 3] })).toThrow();
  });

  it('normalized scalars, nullable and readonly values, unions and literal null', () => {
    const schema = z.strictObject({
      name: z.string().max(9),
      when: z.date().nullable().readonly(),
      choice: z.union([z.literal('x'), z.strictObject({ y: z.boolean() })]),
      none: z.literal(null),
      count: z.int().positive().optional(),
    });
    const input = { name: ' A ', when: null, choice: { y: true }, none: null, count: 2 };
    expect(accepts(schema, input)).not.toThrow();
    expect(accepts(schema, { ...input, when: new Date(1), choice: 'x' })).not.toThrow();
  });
});

describe('the handler receives a fresh copy with only the declared keys (r5 B20)', () => {
  it('at every depth, without a prototype, keeping only the keys present', () => {
    const schema = z.strictObject({
      profile: z.strictObject({ toString: z.string().optional(), name: z.string() }).optional(),
      tags: z.array(z.strictObject({ constructor: z.number().optional() })),
      fixed: z.strictObject({ a: z.string() }).readonly(),
    });
    const input = Object.assign(Object.create(null), {
      profile: Object.assign(Object.create(null), { name: 'n' }),
      tags: [Object.create(null)],
      fixed: { a: 'x' },
    });
    const parsed = schema.parse(input);
    const copy = exact(schema, parsed) as {
      profile: Record<string, unknown>;
      tags: Record<string, unknown>[];
      fixed: Record<string, unknown>;
    };
    expect(copy).not.toBe(parsed);
    expect(copy.profile).not.toBe(parsed.profile);
    expect(copy.profile.toString).toBeUndefined();
    expect(Object.keys(copy.profile)).toEqual(['name']);
    expect(copy.tags[0]?.constructor).toBeUndefined();
    expect(Object.getPrototypeOf(copy.fixed)).toBeNull();
    expect(Object.isFrozen(copy.fixed)).toBe(true);
    expect(exact(z.strictObject({ s: z.string() }), { s: 'v' })).toEqual({ s: 'v' });
  });
});

describe('the copy is frozen exactly where zod froze the parsed value (B22)', () => {
  it('an array union whose readonly branch zod chose after a length check failed', () => {
    const schema = z.strictObject({
      v: z.union([z.array(z.string()).min(3), z.array(z.string()).readonly()]),
    });
    const parsed = schema.parse({ v: ['a'] });
    expect(Object.isFrozen(parsed.v)).toBe(true);
    const copy = exact(schema, parsed) as { v: string[] };
    expect(Object.isFrozen(copy.v)).toBe(true);
    const long = exact(schema, schema.parse({ v: ['a', 'b', 'c'] })) as { v: string[] };
    expect(Object.isFrozen(long.v)).toBe(false);
  });

  it('an object union whose readonly branch zod chose after a length check failed', () => {
    const schema = z.strictObject({
      v: z.union([
        z.strictObject({ a: z.string().min(5) }),
        z.strictObject({ a: z.string() }).readonly(),
      ]),
    });
    const parsed = schema.parse({ v: { a: 'x' } });
    expect(Object.isFrozen(parsed.v)).toBe(true);
    const copy = exact(schema, parsed) as { v: object };
    expect(Object.isFrozen(copy.v)).toBe(true);
    const long = exact(schema, schema.parse({ v: { a: 'xxxxx' } })) as { v: object };
    expect(Object.isFrozen(long.v)).toBe(false);
  });
});

describe('a form file is exactly a File (r5 B19)', () => {
  const form = z.strictObject({ file: z.file() });

  it('a File, also one parsed from a multipart body, is accepted', async () => {
    const body = new FormData();
    body.append('f', new Blob(['abc'], { type: 'text/plain' }), 'a.txt');
    const upload = (await new Request('http://l/', { method: 'POST', body }).formData()).get('f');
    expect(accepts(form, { file: upload })).not.toThrow();
    expect(accepts(form, { file: new File(['x'], 'x.txt') })).not.toThrow();
  });

  it('a Blob, or a File carrying an added key of any kind, is refused', () => {
    expect(refuses(form, { file: new Blob(['x']) })).toThrow(/declared shape/);
    const tagged = Object.assign(new File(['x'], 'x.txt'), { [Symbol('owner')]: 'other' });
    expect(refuses(form, { file: tagged })).toThrow(/declared shape/);
    const named = Object.assign(new File(['x'], 'x.txt'), { userId: 'other' });
    expect(refuses(form, { file: named })).toThrow(/declared shape/);
  });
});
