import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { normalizeRosterEmail, optOutTokenHash } from './roster-crypto';

describe('linear roster email validation', () => {
  it.each([
    ['  Ana.K@Example.COM ', 'ana.k@example.com'],
    ['a@b.c', 'a@b.c'],
    ['a@b..c', 'a@b..c'],
    ['a@.b.c', 'a@.b.c'],
    ['a@b.c.', 'a@b.c.'],
    ['ü@例.子', 'ü@例.子'],
    ['a'.repeat(250) + '@b.c', 'a'.repeat(250) + '@b.c'],
    ['', null],
    ['a@b', null],
    ['@b.c', null],
    ['a@.c', null],
    ['a@b.', null],
    ['a@@b.c', null],
    ['a@b.c@d.e', null],
    ['a b@c.d', null],
    ['a@b\tc.d', null],
    ['a@b\u00a0c.d', null],
    ['a@b\u2028c.d', null],
    ['a'.repeat(251) + '@b.c', null],
    ['a'.repeat(100_000) + '@b', null],
  ])('normalizes %s', (input, expected) => {
    expect(normalizeRosterEmail(input)).toBe(expected);
  });

  it('hashes tokens with SHA-256 and a distinct, NUL-separated domain', () => {
    const token = 'private-opt-out-token';
    expect(optOutTokenHash(token)).toBe(
      createHash('sha256').update('sponsor-roster-opt-out\u0000').update(token).digest('base64url')
    );
    expect(optOutTokenHash(token)).not.toBe(createHash('sha256').update(token).digest('base64url'));
    expect(optOutTokenHash(`${token}2`)).not.toBe(optOutTokenHash(token));
  });
});
