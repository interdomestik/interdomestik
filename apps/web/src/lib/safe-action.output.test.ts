import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { assertParsedShape } from './safe-action.output';

const accepts = (schema: z.ZodType, input: unknown) => () =>
  assertParsedShape(schema, schema.parse(input), 'op');
const refuses = (schema: z.ZodType, value: unknown) => () => assertParsedShape(schema, value, 'op');

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
    // zod reads an inherited value for a plain `{}`; a null-prototype input omits the keys.
    expect(accepts(schema, Object.create(null))).not.toThrow();
    expect(() => assertParsedShape(schema, {}, 'op')).not.toThrow();
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
      name: z.string().trim().toLowerCase(),
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
