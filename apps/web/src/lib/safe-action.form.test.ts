import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { isActionFailure } from './safe-action.failure';
import { formDataToInput } from './safe-action.form';
import { arrayFieldKeys } from './safe-action.schema';

const schema = z.strictObject({
  title: z.string(),
  tags: z.array(z.string()).optional(),
  file: z.file().optional(),
});
const arrays = arrayFieldKeys(schema);

function form(entries: Array<[string, string | File]>) {
  const data = new FormData();
  for (const [key, value] of entries) data.append(key, value);
  return data;
}

describe('formDataToInput', () => {
  it('finds the top-level array keys through optional wrappers', () => {
    expect([...arrays]).toEqual(['tags']);
  });

  it("drops Next's $ACTION_ fields and builds a null-prototype map", () => {
    const input = formDataToInput(
      form([
        ['$ACTION_ID_abc', ''],
        ['$ACTION_REF_1', ''],
        ['title', 'Hello'],
      ]),
      arrays
    );
    expect(isActionFailure(input)).toBe(false);
    expect(Object.getPrototypeOf(input)).toBeNull();
    expect({ ...(input as object) }).toEqual({ title: 'Hello' });
    expect(schema.safeParse(input).success).toBe(true);
  });

  it('collects every value of an array key', () => {
    const input = formDataToInput(
      form([
        ['title', 't'],
        ['tags', 'a'],
        ['tags', 'b'],
      ]),
      arrays
    );
    expect({ ...(input as object) }).toEqual({ title: 't', tags: ['a', 'b'] });
  });

  it('refuses a repeated scalar key', () => {
    const input = formDataToInput(
      form([
        ['title', 'a'],
        ['title', 'b'],
      ]),
      arrays
    );
    expect(isActionFailure(input) && input.code).toBe('VALIDATION_ERROR');
    expect(isActionFailure(input) && input.issues).toEqual({ title: 'duplicate_field' });
  });

  it('keeps a File for a z.file() field', () => {
    const file = new File(['x'], 'evidence.pdf', { type: 'application/pdf' });
    const input = formDataToInput(
      form([
        ['title', 't'],
        ['file', file],
      ]),
      arrays
    );
    expect((input as Record<string, unknown>).file).toBeInstanceOf(File);
    expect(schema.safeParse(input).success).toBe(true);
  });

  it('refuses a second argument that is not FormData', () => {
    const input = formDataToInput({ title: 't' }, arrays);
    expect(isActionFailure(input) && input.code).toBe('VALIDATION_ERROR');
  });
});
