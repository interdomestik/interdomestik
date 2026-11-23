// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { ActionDefinitionError } from './safe-action';
import { buildInputGuard, isIntegrityError } from './safe-action.guard';

const options = {
  operation: 'guard.test',
  basisKind: 'role',
  form: false,
  subjectFrom: null,
} as const;
const guardFor = (input: z.ZodType) => buildInputGuard(input, options);

describe('the captured schema', () => {
  it.each([
    ['refine', z.string().refine(async () => true), /async refinements are not supported/],
    ['superRefine', z.string().superRefine(async () => {}), /async refinements are not supported/],
    ['check', z.string().check(async () => {}), /async refinements are not supported/],
    ['transform', z.string().transform(async value => value), /async transforms are not supported/],
    [
      'standalone transform',
      z.transform(async value => value),
      /async transforms are not supported/,
    ],
    [
      'preprocess',
      z.preprocess(async value => value, z.string()),
      /async transforms are not supported/,
    ],
    ['Promise schema', z.promise(z.string()), /Promise schemas require async parsing/],
    [
      'overwrite',
      z.string().overwrite((async (value: string) => value) as never),
      /async checks are not supported/,
    ],
  ])('refuses async parsing at definition for %s', (_kind, field, reason) => {
    expect(() => guardFor(z.strictObject({ field }))).toThrow(ActionDefinitionError);
    expect(() => guardFor(z.strictObject({ field }))).toThrow(reason);
  });

  it.each([
    [z.string().exactOptional(), undefined],
    [z.array(z.string().exactOptional()), [undefined]],
  ])('refuses exact-optional fields and array elements at definition (%#)', (schema, value) => {
    const input = z.strictObject({ field: schema });
    expect(input.safeParse({ field: value }).success).toBe(false);
    expect(() => guardFor(input)).toThrow(/exact.?optional/i);
  });

  it('uses the captured shape for admission, subject, classification and parsing', async () => {
    const shape: Record<string, z.ZodType> = { tag: z.array(z.string()).optional() };
    const input = z.strictObject(shape);
    const guard = buildInputGuard(input, { ...options, subjectFrom: ['tag'] });
    shape.tag = z.number();
    expect(guard.fieldKind(['tag'])).toBe('array');
    expect(guard.fieldKind(['missing'])).toBeUndefined();
    expect(await guard.run({ tag: ['one'] }, false)).toMatchObject({
      kind: 'value',
      value: { tag: ['one'] },
    });
  });

  it.each(['lazy', 'materialized', 'non-enumerable'])(
    'refuses a %s shape getter without calling it',
    kind => {
      const getter = vi.fn(() => z.string());
      const rawShape = {};
      const input = z.strictObject(rawShape);
      const shape = kind === 'materialized' ? input.shape : rawShape;
      Object.defineProperty(shape, 'tag', {
        enumerable: kind !== 'non-enumerable',
        get: getter,
      });

      expect(() => guardFor(input)).toThrow(/at tag: a shape field that is not own data/);
      expect(getter).not.toHaveBeenCalled();
    }
  );

  it.each(['lazy', 'materialized'])('refuses a non-enumerable data field in a %s shape', kind => {
    const rawShape = { visible: z.string() };
    const input = z.strictObject(rawShape);
    const shape = kind === 'lazy' ? rawShape : input.shape;
    Object.defineProperty(shape, 'hidden', { value: z.string() });
    expect(() => guardFor(input)).toThrow(/at hidden: a shape field that is not enumerable/);
  });

  it('refuses a proxy shape before running any trap', () => {
    const trap = vi.fn(() => {
      throw new Error('shape proxy trap');
    });
    const shape = new Proxy(
      { tag: z.string() },
      {
        get: trap,
        getOwnPropertyDescriptor: trap,
        getPrototypeOf: trap,
        ownKeys: trap,
      }
    );

    expect(() => guardFor(z.strictObject(shape))).toThrow(/an invalid object shape/);
    expect(trap).not.toHaveBeenCalled();
  });

  it('classifies an admitted optional array at query.tag and checks the object part and subject path', async () => {
    const input = z.strictObject({
      query: z.strictObject({ tag: z.array(z.string()).optional() }),
    });
    const query = { ...options, objectParts: ['query'] };
    const guard = buildInputGuard(input, { ...query, subjectFrom: ['query', 'tag'] });
    expect(guard.fieldKind(['query'])).toBe('object');
    expect(guard.fieldKind(['query', 'tag'])).toBe('array');
    expect(await guard.run({ query: { tag: ['one'] } }, false)).toMatchObject({
      kind: 'value',
      value: { query: { tag: ['one'] } },
    });
    expect(() => buildInputGuard(input, { ...query, subjectFrom: ['query', 'Tag'] })).toThrow(
      ActionDefinitionError
    );
    expect(() => buildInputGuard(input, { ...query, subjectFrom: ['query', 'tag', '0'] })).toThrow(
      ActionDefinitionError
    );
    expect(() => buildInputGuard(z.strictObject({ query: z.string() }), query)).toThrow(
      ActionDefinitionError
    );
  });

  it('refuses multiple array branches and a mixed query field', () => {
    const arrays = z.union([z.array(z.string()), z.array(z.number())]);
    expect(() => guardFor(z.strictObject({ field: arrays }))).toThrow(ActionDefinitionError);
    const query = z.strictObject({ tag: z.union([z.array(z.string()), z.string()]) });
    expect(() =>
      buildInputGuard(z.strictObject({ query }), { ...options, objectParts: ['query'] })
    ).toThrow(ActionDefinitionError);
  });

  it('classifies an optional query tuple as an array', async () => {
    const query = z.strictObject({ pair: z.tuple([z.string(), z.string()]).optional() });
    const guard = buildInputGuard(z.strictObject({ query }), {
      ...options,
      objectParts: ['query'],
    });
    expect(guard.fieldKind(['query', 'pair'])).toBe('array');
    expect(await guard.run({ query: { pair: ['a', 'b'] } }, false)).toMatchObject({
      kind: 'value',
      value: { query: { pair: ['a', 'b'] } },
    });
  });

  it('refuses a tuple-or-scalar query field at definition', () => {
    const query = z.strictObject({ pair: z.union([z.tuple([z.string()]), z.string()]) });
    expect(() =>
      buildInputGuard(z.strictObject({ query }), { ...options, objectParts: ['query'] })
    ).toThrow(/query\.pair: a query field may not mix array and non-array/);
  });

  it.each(['constructor', '__proto__', 'valueOf'])(
    'refuses reserved name %s both at the root and nested',
    key => {
      const bad = z.strictObject({ [key]: z.string() });
      expect(() => guardFor(bad)).toThrow(ActionDefinitionError);
      expect(() => guardFor(z.strictObject({ nested: bad }))).toThrow(ActionDefinitionError);
    }
  );

  it.each([
    ['exclusive lower bound', 0, 'too_small'],
    ['inclusive upper bound', 6, 'too_big'],
    ['multipleOf', 3, 'not_multiple_of'],
  ])('independently enforces the %s in a chain of numeric checks', async (_kind, value, code) => {
    const input = guardFor(z.strictObject({ field: z.number().gt(0).lte(4).multipleOf(2) }));
    expect(await input.run({ field: 4 }, false)).toMatchObject({ kind: 'value' });
    expect(await input.run({ field: value }, false)).toMatchObject({
      kind: 'invalid',
      failure: { issues: { field: code } },
    });
  });

  it('preserves a synchronous parser throw by identity and returns the completed snapshot', async () => {
    const error = Object.assign(new Error('denied'), { code: 'FORBIDDEN' });
    const guard = guardFor(
      z.strictObject({
        id: z.string().refine(() => {
          throw error;
        }),
      })
    );
    const outcome = await guard.run({ id: 'ID-A' }, false);
    expect(outcome).toMatchObject({ kind: 'thrown', snapshot: { id: 'ID-A' } });
    expect(outcome.kind === 'thrown' && outcome.error).toBe(error);
  });

  it('does not start later predicates after a synchronous throw', async () => {
    const error = new Error('first refinement failed');
    const later = vi.fn(() => true);
    const field = z
      .string()
      .refine(() => {
        throw error;
      })
      .refine(later);
    expect(() => field.safeParse('x')).toThrow(error);
    expect(later).not.toHaveBeenCalled();
    const result = await guardFor(z.strictObject({ field })).run({ field: 'x' }, false);
    expect(result).toMatchObject({ kind: 'thrown', snapshot: { field: 'x' } });
    expect(result.kind === 'thrown' && result.error).toBe(error);
    expect(later).not.toHaveBeenCalled();
  });

  it('rejects a Date at an object position without refining its inherited toISOString', async () => {
    const predicate = vi.fn(() => {
      throw new Error('unexpected refinement');
    });
    const guard = guardFor(
      z.strictObject({
        field: z.strictObject({ toISOString: z.coerce.string().optional().refine(predicate) }),
      })
    );
    expect(await guard.run({ field: new Date(1) }, false)).toMatchObject({
      kind: 'invalid',
      failure: { issues: { field: 'invalid_type' } },
    });
    expect(predicate).not.toHaveBeenCalled();
  });

  it('preserves a Date union branch without reading inherited fields in the object branch', async () => {
    const guard = guardFor(
      z.strictObject({
        field: z.union([z.strictObject({ toISOString: z.string().optional() }), z.date()]),
      })
    );
    const date = new Date(1);
    const descriptor = Object.getOwnPropertyDescriptor(Date.prototype, 'toISOString')!;
    const getter = vi.fn(() => descriptor.value);
    Object.defineProperty(Date.prototype, 'toISOString', { configurable: true, get: getter });
    let outcome;
    try {
      outcome = await guard.run({ field: date }, false);
    } finally {
      Object.defineProperty(Date.prototype, 'toISOString', descriptor);
    }
    expect(outcome).toMatchObject({ kind: 'value', value: { field: date } });
    expect(getter).not.toHaveBeenCalled();
  });

  it('shadows an inherited abortEarly getter throughout private parsing', async () => {
    const abortEarly = vi.fn(() => false);
    const guard = guardFor(
      z.strictObject({
        start: z.string().refine(() => {
          Object.defineProperty(Object.prototype, 'abortEarly', {
            configurable: true,
            get: abortEarly,
          });
          return true;
        }),
        nested: z.strictObject({ field: z.string() }),
        end: z.string().refine(() => Reflect.deleteProperty(Object.prototype, 'abortEarly')),
      })
    );
    try {
      expect(
        await guard.run({ start: 'x', nested: { field: 'x' }, end: 'x' }, false)
      ).toMatchObject({ kind: 'value' });
    } finally {
      Reflect.deleteProperty(Object.prototype, 'abortEarly');
    }
    expect(abortEarly).not.toHaveBeenCalled();
  });

  it('gates the invalid outcome after Zod formats its lazy error', async () => {
    const guard = guardFor(z.strictObject({ field: z.string() }));
    const { customError } = z.config();
    const format = vi.fn(() => {
      Object.defineProperty(Object.prototype, 'duringIssueFormatting', {
        configurable: true,
        value: true,
      });
      return 'invalid field';
    });
    let caught: unknown;
    z.config({ customError: format });
    try {
      await guard.run({ field: 1 }, false);
    } catch (error) {
      caught = error;
    } finally {
      Reflect.deleteProperty(Object.prototype, 'duringIssueFormatting');
      z.config({ customError });
    }
    expect(format).toHaveBeenCalledOnce();
    expect(isIntegrityError(caught)).toBe(true);
  });
});
