import { describe, expect, it } from 'vitest';
import { redactEmail } from './membership-confirmation';

describe('redactEmail', () => {
  it('rejects missing and malformed addresses', () => {
    expect(redactEmail(undefined)).toBe('unknown');
    expect(redactEmail(null)).toBe('unknown');
    expect(redactEmail('')).toBe('unknown');
    expect(redactEmail('invalid')).toBe('unknown');
  });

  it('masks short and long local parts', () => {
    expect(redactEmail('a@b.com')).toBe('a*@b.com');
    expect(redactEmail('ab@b.com')).toBe('a*@b.com');
    expect(redactEmail('john.doe@example.com')).toBe('j***e@example.com');
    expect(redactEmail('alice@test.com')).toBe('a***e@test.com');
  });
});
