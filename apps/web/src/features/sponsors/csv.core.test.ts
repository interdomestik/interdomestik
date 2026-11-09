import { describe, expect, it } from 'vitest';
import { parseSponsorCsv } from './csv.core';

describe('sponsor CSV', () => {
  it('reuses quoting, supports BOM/reordered headers and preserves invalid rows for summary counts', () => {
    expect(
      parseSponsorCsv('\uFEFFemail,lastName,firstName\r\na@example.com,"O""Neil, Jr",Ada\r\n,,')
    ).toEqual([
      { firstName: 'Ada', lastName: 'O"Neil, Jr', email: 'a@example.com' },
      { firstName: '', lastName: '', email: '' },
    ]);
  });
  it('refuses missing, duplicate or extra columns and oversized lists', () => {
    for (const text of [
      'firstName,lastName',
      'firstName,firstName,email',
      'firstName,lastName,email,password',
      'firstName,lastName,email\n"Ada,One,ada@example.com',
      `firstName,lastName,email\n${'A,B,a@example.com\n'.repeat(501)}`,
    ])
      expect(parseSponsorCsv(text)).toBeNull();
  });
});
