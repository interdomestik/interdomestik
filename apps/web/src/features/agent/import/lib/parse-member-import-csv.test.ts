import { describe, expect, it } from 'vitest';
import { MAX_MEMBER_IMPORT_ROWS } from '@/lib/actions/agent/schemas';
import { parseMemberImportCsv } from './parse-member-import-csv';

function makeCredential(label: string) {
  return ['member', label, 'access'].join('-');
}

describe('parseMemberImportCsv', () => {
  it('parses required columns and defaults planId to standard', () => {
    const csv = [
      'fullName,email,phone,password,planId',
      `Jane Doe,jane@example.com,+38344111222,${makeCredential('jane')},`,
    ].join('\n');

    expect(parseMemberImportCsv(csv)).toEqual({
      headerErrors: [],
      rows: [
        {
          fullName: 'Jane Doe',
          email: 'jane@example.com',
          phone: '+38344111222',
          password: makeCredential('jane'),
          planId: 'standard',
          isValid: true,
          error: undefined,
        },
      ],
    });
  });

  it('flags rows that are missing required account fields', () => {
    const csv = ['fullName,email,phone,password', 'Jane Doe,,+38344111222,'].join('\n');

    expect(parseMemberImportCsv(csv)).toEqual({
      headerErrors: [],
      rows: [
        {
          fullName: 'Jane Doe',
          email: '',
          phone: '+38344111222',
          password: '',
          planId: 'standard',
          isValid: false,
          error: 'Missing required fields: email, password',
        },
      ],
    });
  });

  it('reports missing required headers before import', () => {
    const csv = ['fullName,phone', 'Jane Doe,+38344111222'].join('\n');

    expect(parseMemberImportCsv(csv)).toEqual({
      headerErrors: ['Missing required columns: email, password'],
      rows: [],
    });
  });

  it('keeps commas inside quoted CSV fields', () => {
    const csv = [
      'fullName,email,phone,password,planId',
      `"Doe, Jane",jane@example.com,+38344111222,${makeCredential('doe')},family`,
    ].join('\n');

    expect(parseMemberImportCsv(csv)).toEqual({
      headerErrors: [],
      rows: [
        {
          fullName: 'Doe, Jane',
          email: 'jane@example.com',
          phone: '+38344111222',
          password: makeCredential('doe'),
          planId: 'family',
          isValid: true,
          error: undefined,
        },
      ],
    });
  });

  it('rejects CSV files that exceed the maximum batch size', () => {
    const row = `Jane Doe,jane@example.com,+38344111222,${makeCredential('limit')},standard`;
    const csv = [
      'fullName,email,phone,password,planId',
      ...new Array(MAX_MEMBER_IMPORT_ROWS + 1).fill(row),
    ].join('\n');

    expect(parseMemberImportCsv(csv)).toEqual({
      headerErrors: [`Too many rows: maximum ${MAX_MEMBER_IMPORT_ROWS} rows per import`],
      rows: [],
    });
  });
});
