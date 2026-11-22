// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { buildInputGuard } from './safe-action.guard';
import { ActionDefinitionError } from './safe-action.schema';

const schema = z.strictObject({
  title: z.string(),
  tags: z.array(z.string()).optional(),
  file: z.file().optional(),
});
const options = {
  operation: 'guard.form',
  basisKind: 'role',
  form: true,
  subjectFrom: null,
} as const;
const guard = buildInputGuard(schema, options);

function form(entries: Array<[string, string | File]>) {
  const data = new FormData();
  for (const [key, value] of entries) data.append(key, value);
  return data;
}

describe('the form guard adapter', () => {
  it('finds the top-level array keys through optional wrappers', () => {
    expect(guard.fieldKind(['tags'])).toBe('array');
    expect(guard.fieldKind(['title'])).toBe('scalar');
    expect(guard.fieldKind(['file'])).toBe('scalar');
  });

  it('refuses a union with two array branches even through wrappers', () => {
    const union = z.strictObject({
      v: z.union([z.array(z.string()).min(3), z.array(z.string()).readonly()]).optional(),
      w: z.string(),
    });
    expect(() => buildInputGuard(union, options)).toThrow(ActionDefinitionError);
  });

  it("drops Next's $ACTION_ fields and builds a null-prototype map", async () => {
    const result = await guard.run(
      form([
        ['$ACTION_ID_abc', ''],
        ['$ACTION_REF_1', ''],
        ['title', 'Hello'],
      ]),
      true
    );
    expect(result).toMatchObject({ kind: 'value', value: { title: 'Hello' } });
    expect(Object.getPrototypeOf(result.snapshot)).toBeNull();
    expect({ ...(result.snapshot as object) }).toEqual({ title: 'Hello' });
  });

  it.each([['a'], ['a', 'b']])('collects every value of an array key (%j)', async (...tags) => {
    const data = form([['title', 't']]);
    for (const tag of tags) data.append('tags', tag);
    expect(await guard.run(data, true)).toMatchObject({
      kind: 'value',
      value: { title: 't', tags },
    });
  });

  it('collects repeated FormData entries for a tuple field', async () => {
    const tuple = buildInputGuard(
      z.strictObject({ pair: z.tuple([z.string(), z.string()]) }),
      options
    );
    expect(
      await tuple.run(
        form([
          ['pair', 'a'],
          ['pair', 'b'],
        ]),
        true
      )
    ).toMatchObject({ kind: 'value', value: { pair: ['a', 'b'] } });
  });

  it('refuses a tuple-or-scalar form field at definition', () => {
    const pair = z.union([z.tuple([z.string()]), z.string()]);
    expect(() => buildInputGuard(z.strictObject({ pair }), options)).toThrow(
      /pair: a form field may not mix array and non-array/
    );
  });

  it('refuses an omitted form key that Zod supplies through coercion', async () => {
    const flag = buildInputGuard(z.strictObject({ flag: z.coerce.boolean() }), options);
    expect(await flag.run(new FormData(), true)).toMatchObject({
      kind: 'invalid',
      failure: { code: 'VALIDATION_ERROR', issues: { flag: 'invalid_type' } },
    });
  });

  it('refuses a repeated scalar key', async () => {
    const result = await guard.run(
      form([
        ['title', 'a'],
        ['title', 'b'],
      ]),
      true
    );
    expect(result).toMatchObject({
      kind: 'invalid',
      failure: { code: 'VALIDATION_ERROR', issues: { title: 'duplicate_field' } },
    });
  });

  it('copies a File for a z.file() field', async () => {
    const file = new File(['x'], 'evidence.pdf', { type: 'application/pdf' });
    const result = await guard.run(
      form([
        ['title', 't'],
        ['file', file],
      ]),
      true
    );
    expect(result).toMatchObject({ kind: 'value', value: { title: 't', file: expect.any(File) } });
    expect(schema.safeParse(result.snapshot).success).toBe(true);
  });

  it('rejects a File at an object position without refining its inherited name', async () => {
    const predicate = vi.fn(() => {
      throw new Error('unexpected refinement');
    });
    const input = buildInputGuard(
      z.strictObject({
        file: z.file().optional(),
        field: z.strictObject({ name: z.coerce.string().optional().refine(predicate) }),
      }),
      options
    );
    const file = new File(['ok'], 'supplied.txt');
    expect(await input.run(form([['field', file]]), true)).toMatchObject({
      kind: 'invalid',
      failure: { issues: { field: 'invalid_type' } },
    });
    expect(predicate).not.toHaveBeenCalled();
  });

  it('refuses a second argument that is not FormData', async () => {
    expect(await guard.run({ title: 't' }, true)).toMatchObject({
      kind: 'invalid',
      failure: { code: 'VALIDATION_ERROR' },
    });
  });
});
