import { describe, expect, it } from 'vitest';

import {
  normalizeRosterEmail,
  optOutToken,
  optOutTokenHash,
  readSponsorRosterSecret,
  rosterEmailHmac,
  SponsorRosterSecretMissingError,
} from './roster-crypto';
import { MAX_UPLOAD_ROWS, prepareRosterRows } from './roster-upload';

const secret = 'x'.repeat(32);
const row = (email: string, firstName = 'Ana', lastName = 'Krasniqi') => ({
  email,
  firstName,
  lastName,
});

const env = (values: Record<string, string>): NodeJS.ProcessEnv =>
  ({ NODE_ENV: 'test', ...values }) as NodeJS.ProcessEnv;

describe('roster crypto', () => {
  it('fails closed without a long enough secret', () => {
    expect(() => readSponsorRosterSecret(env({}))).toThrow(SponsorRosterSecretMissingError);
    expect(() => readSponsorRosterSecret(env({ SPONSOR_ROSTER_SECRET: 'short' }))).toThrow(
      SponsorRosterSecretMissingError
    );
    expect(readSponsorRosterSecret(env({ SPONSOR_ROSTER_SECRET: ` ${secret} ` }))).toBe(secret);
  });

  it('normalizes addresses and separates the email and opt-out derivations', () => {
    expect(normalizeRosterEmail('  Ana.K@Example.COM ')).toBe('ana.k@example.com');
    expect(normalizeRosterEmail('not-an-address')).toBeNull();
    const hmac = rosterEmailHmac(secret, 'ana@example.com');
    expect(hmac).toBe(rosterEmailHmac(secret, 'ana@example.com'));
    expect(hmac).not.toBe(rosterEmailHmac('y'.repeat(32), 'ana@example.com'));
    expect(optOutToken(secret, 'ana@example.com')).not.toBe(hmac);
    expect(optOutTokenHash(optOutToken(secret, 'e1'))).not.toContain(optOutToken(secret, 'e1'));
  });
});

describe('prepareRosterRows', () => {
  it('drops invalid rows, deduplicates by address and orders by HMAC', () => {
    const prepared = prepareRosterRows(
      [
        row('b@example.com'),
        row('A@example.com'),
        row('a@example.com '),
        row('bad'),
        row('c@example.com', ' '),
      ],
      secret
    );
    expect(prepared?.invalid).toBe(2);
    expect(prepared?.duplicates).toBe(1);
    const hmacs = prepared?.rows.map(item => item.emailHmac) ?? [];
    expect(hmacs).toEqual([...hmacs].sort((a, b) => a.localeCompare(b)));
    expect(prepared?.rows.map(item => item.emailNormalized).sort()).toEqual([
      'a@example.com',
      'b@example.com',
    ]);
  });

  it('refuses more than the upload limit', () => {
    const rows = Array.from({ length: MAX_UPLOAD_ROWS + 1 }, (_, i) => row(`p${i}@example.com`));
    expect(prepareRosterRows(rows, secret)).toBeNull();
  });
});
