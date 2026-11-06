import { describe, expect, it } from 'vitest';
import { MAX_MEMBER_IMPORT_ROWS } from '@/lib/actions/agent/schemas';
import { parseMemberImportCsv } from './parse-member-import-csv';

describe('parseMemberImportCsv', () => {
  it('parses required columns and defaults planId to standard', () => {
    const csv = ['fullName,email,phone,planId', 'Jane Doe,jane@example.com,+38344111222,'].join(
      '\n'
    );

    expect(parseMemberImportCsv(csv)).toEqual({
      headerErrors: [],
      rows: [
        {
          fullName: 'Jane Doe',
          email: 'jane@example.com',
          phone: '+38344111222',
          planId: 'standard',
          isValid: true,
          error: undefined,
        },
      ],
    });
  });

  it('refuses a roster that carries a password column (members set their own credential)', () => {
    const csv = ['fullName,email,phone,password', 'Jane Doe,jane@example.com,+383441,x'].join('\n');

    expect(parseMemberImportCsv(csv)).toEqual({
      headerErrors: ['Remove the password column: members set their own credential'],
      rows: [],
    });
  });

  it('flags rows that are missing required account fields', () => {
    const csv = ['fullName,email,phone', 'Jane Doe,,+38344111222'].join('\n');

    expect(parseMemberImportCsv(csv)).toEqual({
      headerErrors: [],
      rows: [
        {
          fullName: 'Jane Doe',
          email: '',
          phone: '+38344111222',
          planId: 'standard',
          isValid: false,
          error: 'Missing required fields: email',
        },
      ],
    });
  });

  it('reports missing required headers before import', () => {
    const csv = ['fullName,phone', 'Jane Doe,+38344111222'].join('\n');

    expect(parseMemberImportCsv(csv)).toEqual({
      headerErrors: ['Missing required columns: email'],
      rows: [],
    });
  });

  it('keeps commas inside quoted CSV fields', () => {
    const csv = [
      'fullName,email,phone,planId',
      '"Doe, Jane",jane@example.com,+38344111222,family',
    ].join('\n');

    expect(parseMemberImportCsv(csv).rows[0]).toMatchObject({
      fullName: 'Doe, Jane',
      planId: 'family',
      isValid: true,
    });
  });

  it('rejects CSV files that exceed the maximum batch size', () => {
    const row = 'Jane Doe,jane@example.com,+38344111222,standard';
    const csv = [
      'fullName,email,phone,planId',
      ...new Array(MAX_MEMBER_IMPORT_ROWS + 1).fill(row),
    ].join('\n');

    expect(parseMemberImportCsv(csv)).toEqual({
      headerErrors: [`Too many rows: maximum ${MAX_MEMBER_IMPORT_ROWS} rows per import`],
      rows: [],
    });
  });
});
