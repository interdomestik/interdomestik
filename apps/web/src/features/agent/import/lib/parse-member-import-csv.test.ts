import { describe, expect, it } from 'vitest';
import { parseMemberImportCsv } from './parse-member-import-csv';

describe('parseMemberImportCsv', () => {
  it('parses required columns and defaults planId to standard', () => {
    const csv = [
      'fullName,email,phone,password,planId',
      'Jane Doe,jane@example.com,+38344111222,Secret123!,',
    ].join('\n');

    expect(parseMemberImportCsv(csv)).toEqual({
      headerErrors: [],
      rows: [
        {
          fullName: 'Jane Doe',
          email: 'jane@example.com',
          phone: '+38344111222',
          password: 'Secret123!',
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
});
