// @vitest-environment node
import { runInNewContext } from 'node:vm';
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((fulfil, fail) => {
    resolve = fulfil;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe('the captured schema', () => {
  it.each([
    [z.string().exactOptional(), undefined],
    [z.array(z.string().exactOptional()), [undefined]],
  ])('refuses exact-optional fields and array elements at definition (%#)', (schema, value) => {
    const input = z.strictObject({ field: schema });
    expect(input.safeParse({ field: value }).success).toBe(false);
    expect(() => guardFor(input)).toThrow(/exact.?optional/i);
  });

  it('reads shape and field getters once for admission, subject, classification and parsing', async () => {
    const field = vi.fn(() => z.array(z.string()).optional());
    const input = z.strictObject({
      get tag() {
        return field();
      },
    });
    const guard = buildInputGuard(input, { ...options, subjectFrom: ['tag'] });
    expect(guard.fieldKind(['tag'])).toBe('array');
    expect(guard.fieldKind(['missing'])).toBeUndefined();
    expect(await guard.run({ tag: ['one'] }, false)).toMatchObject({
      kind: 'value',
      value: { tag: ['one'] },
    });
    expect(field).toHaveBeenCalledTimes(1);
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

  it('preserves a parser rejection by identity and returns the completed snapshot', async () => {
    const error = Object.assign(new Error('denied'), { code: 'FORBIDDEN' });
    const guard = guardFor(
      z.strictObject({
        id: z.string().refine(async () => {
          throw error;
        }),
      })
    );
    const outcome = await guard.run({ id: 'ID-A' }, false);
    expect(outcome).toMatchObject({ kind: 'thrown', snapshot: { id: 'ID-A' } });
    expect(outcome.kind === 'thrown' && outcome.error).toBe(error);
  });

  it('waits for a slow sibling refinement before returning a thrown outcome', async () => {
    const slow = deferred<boolean>();
    const failure = deferred<boolean>();
    const settled = vi.fn();
    const error = new Error('refinement rejected');
    const started = deferred<void>();
    const guard = guardFor(
      z.strictObject({
        a: z.string().refine(() => slow.promise),
        b: z.string().refine(() => {
          started.resolve();
          return failure.promise;
        }),
      })
    );
    const run = guard.run({ a: 'x', b: 'y' }, false);
    void run.then(settled, settled);
    await started.promise;
    try {
      failure.reject(error);
      await new Promise<void>(resolve => setImmediate(resolve));
      expect(settled).not.toHaveBeenCalled();
    } finally {
      slow.resolve(true);
    }
    const result = await run;
    expect(result).toMatchObject({ kind: 'thrown', snapshot: { a: 'x', b: 'y' } });
    expect(result.kind === 'thrown' && result.error).toBe(error);
  });

  it('handles a later async rejection after a synchronous sibling throw', async () => {
    const late = deferred<boolean>();
    const error = new Error('synchronous refinement failure');
    const started = deferred<void>();
    const unhandled = vi.fn();
    const guard = guardFor(
      z.strictObject({
        a: z.string().refine(() => late.promise),
        b: z.string().refine(() => {
          started.resolve();
          throw error;
        }),
      })
    );
    process.on('unhandledRejection', unhandled);
    try {
      const run = guard.run({ a: 'x', b: 'y' }, false);
      await started.promise;
      late.reject(new Error('later refinement failure'));
      const result = await run;
      await new Promise<void>(resolve => setImmediate(resolve));
      expect(unhandled).not.toHaveBeenCalled();
      expect(result.kind === 'thrown' && result.error).toBe(error);
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });

  it('awaits false from a foreign-realm refinement promise', async () => {
    const promise: unknown = runInNewContext('Promise.resolve(false)');
    expect(promise).not.toBeInstanceOf(Promise);
    const guard = guardFor(z.strictObject({ field: z.string().refine(() => promise) }));
    expect(await guard.run({ field: 'x' }, false)).toMatchObject({
      kind: 'invalid',
      failure: { issues: { field: 'custom' } },
    });
  });

  it.each([
    ['false', false, 'invalid'],
    ['a non-boolean', 'yes', 'defect'],
  ])('awaits a refinement thenable resolving to %s', async (_label, answer, kind) => {
    const then = vi.fn((resolve: (value: unknown) => void) => resolve(answer));
    const guard = guardFor(z.strictObject({ field: z.string().refine(() => ({ then })) }));
    expect(await guard.run({ field: 'x' }, false)).toMatchObject({
      kind,
      snapshot: { field: 'x' },
    });
    expect(then).toHaveBeenCalledOnce();
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
