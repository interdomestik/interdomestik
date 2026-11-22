import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { buildInputGuard } from './safe-action.guard';

const options = {
  operation: 'guard.output',
  basisKind: 'role',
  form: false,
  subjectFrom: null,
} as const;
const guard = (input: z.ZodType) => buildInputGuard(input, options);

describe('owned input and the handler copy', () => {
  it('rejects an omitted coercing field with invalid_type at the field path', async () => {
    const input = guard(z.strictObject({ coerced: z.coerce.boolean() }));
    expect(await input.run({}, false)).toMatchObject({
      kind: 'invalid',
      failure: { code: 'VALIDATION_ERROR', issues: { coerced: 'invalid_type' } },
    });
  });

  it('allows an omitted coercing field behind an optional wrapper', async () => {
    const input = guard(
      z.strictObject({ coerced: z.coerce.boolean().optional().readonly().nullable() })
    );
    expect(await input.run({}, false)).toMatchObject({ kind: 'value', value: {} });
    expect(await input.run({ coerced: undefined }, false)).toMatchObject({
      kind: 'value',
      value: { coerced: undefined },
    });
  });

  it('refuses an array at a coerced scalar before the numeric refine', async () => {
    const predicate = vi.fn(() => true);
    const input = guard(z.strictObject({ coerced: z.coerce.number().refine(predicate) }));
    expect(await input.run({ coerced: [7] }, false)).toMatchObject({ kind: 'invalid' });
    expect(predicate).not.toHaveBeenCalled();
    expect(await input.run({ coerced: '7' }, false)).toMatchObject({
      kind: 'value',
      value: { coerced: 7 },
    });
  });

  it('refuses sparse or extended arrays and caller getters, iterators and proxies unread', async () => {
    const spy = vi.fn(() => 'x');
    const input = guard(z.strictObject({ tags: z.array(z.string()) }));
    const sparse = new Array<string>(1);
    const extended = Object.assign(['x'], { extra: 'x' });
    const iterator = Object.defineProperty(['x'], Symbol.iterator, { get: spy });
    const getter = Object.defineProperty({}, 'tags', { get: spy });
    const proxy = new Proxy({}, { getOwnPropertyDescriptor: spy as never, ownKeys: spy as never });
    for (const raw of [{ tags: sparse }, { tags: extended }, { tags: iterator }, getter, proxy]) {
      expect(await input.run(raw, false)).toMatchObject({ kind: 'invalid' });
    }
    expect(spy).not.toHaveBeenCalled();
  });

  it('copies Dates freshly and freezes only readonly parsed values', async () => {
    const date = new Date(150);
    const input = guard(
      z.strictObject({
        plain: z.date(),
        readonly: z.date().readonly(),
        list: z.array(z.string()).readonly(),
        obj: z.strictObject({ a: z.string() }).readonly(),
      })
    );
    const raw = { plain: date, readonly: date, list: ['x'], obj: { a: 'x' } };
    const outcome = await input.run(raw, false);
    expect(outcome.kind).toBe('value');
    if (outcome.kind !== 'value') throw new Error('missing handler value');
    const value = outcome.value as typeof raw;
    expect(value).toEqual(raw);
    expect(value.plain).not.toBe(date);
    expect(value.readonly).not.toBe(date);
    expect(Object.isFrozen(value.plain)).toBe(false);
    expect([value.readonly, value.list, value.obj].every(Object.isFrozen)).toBe(true);
    expect(Object.getPrototypeOf(value.obj)).toBe(Object.prototype);
    Object.defineProperty(date, Symbol('extra'), { value: true });
    expect(await input.run(raw, false)).toMatchObject({ kind: 'invalid' });
  });

  it('does not admit a numeric enum reverse label', async () => {
    enum Stage {
      Pending,
      Done,
    }
    const input = guard(z.strictObject({ stage: z.enum(Stage) }));
    expect(await input.run({ stage: Stage.Pending }, false)).toMatchObject({ kind: 'value' });
    expect(await input.run({ stage: 'Pending' }, false)).toMatchObject({ kind: 'invalid' });
  });

  it('enforces the snapshot node budget before the parser', async () => {
    const input = guard(z.strictObject({ tags: z.array(z.string()) }));
    expect(await input.run({ tags: Array<string>(10001).fill('x') }, false)).toMatchObject({
      kind: 'invalid',
      snapshot: null,
    });
  });

  it('refuses an over-depth input before the parser can reject the unknown field', async () => {
    const input = guard(z.strictObject({ tags: z.array(z.string()) }));
    let nested: unknown = 'x';
    for (let level = 0; level < 33; level += 1) nested = { nested };
    expect(await input.run({ tags: [], extra: nested }, false)).toMatchObject({
      kind: 'invalid',
      snapshot: null,
    });
  });
});
