import { describe, expect, it } from 'vitest';
import { isUniqueViolation } from './subscription-values';

describe('subscription insert unique violation discrimination', () => {
  it('recognizes direct and immediate Drizzle cause unique errors', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true);
    expect(isUniqueViolation({ cause: { code: '23505' } })).toBe(true);
  });
  it('does not classify unrelated, nested, or malformed failures as unique', () => {
    for (const error of [
      null,
      undefined,
      '23505',
      { code: '23503' },
      { cause: { code: '23503' } },
      { cause: { cause: { code: '23505' } } },
      { cause: '23505' },
      { code: 23505 },
    ]) {
      expect(isUniqueViolation(error)).toBe(false);
    }
  });
});
