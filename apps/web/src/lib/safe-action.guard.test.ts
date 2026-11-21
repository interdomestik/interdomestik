// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { ActionDefinitionError } from './safe-action';
import { buildInputGuard } from './safe-action.guard';

const options = {
  operation: 'guard.test',
  basisKind: 'role',
  form: false,
  subjectFrom: null,
} as const;
const guardFor = (input: z.ZodType) => buildInputGuard(input, options);

describe('the captured schema', () => {
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
});
