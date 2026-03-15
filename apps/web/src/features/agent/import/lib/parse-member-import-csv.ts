export type ParsedMemberImportRow = {
  fullName: string;
  email: string;
  phone: string;
  password: string;
  planId: 'standard' | 'family';
  isValid: boolean;
  error?: string;
};

type ParsedMemberImportCsv = {
  headerErrors: string[];
  rows: ParsedMemberImportRow[];
};

const REQUIRED_HEADERS = ['fullName', 'email', 'phone', 'password'] as const;

function normalizeHeader(header: string) {
  return header.trim().replace(/^\uFEFF/, '');
}

function splitCsvLine(line: string) {
  return line.split(',').map(value => value.trim());
}

export function parseMemberImportCsv(csv: string): ParsedMemberImportCsv {
  const [headerLine = '', ...rowLines] = csv
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  const headers = splitCsvLine(headerLine).map(normalizeHeader);
  const missingHeaders = REQUIRED_HEADERS.filter(header => !headers.includes(header));

  if (missingHeaders.length > 0) {
    return {
      headerErrors: [`Missing required columns: ${missingHeaders.join(', ')}`],
      rows: [],
    };
  }

  const rows = rowLines.map(line => {
    const values = splitCsvLine(line);
    const row = headers.reduce<Record<string, string>>((acc, header, index) => {
      acc[header] = values[index] ?? '';
      return acc;
    }, {});

    const missingFields = REQUIRED_HEADERS.filter(header => !row[header]);
    const planId: ParsedMemberImportRow['planId'] = row.planId === 'family' ? 'family' : 'standard';

    return {
      fullName: row.fullName ?? '',
      email: row.email ?? '',
      phone: row.phone ?? '',
      password: row.password ?? '',
      planId,
      isValid: missingFields.length === 0,
      error:
        missingFields.length > 0
          ? `Missing required fields: ${missingFields.join(', ')}`
          : undefined,
    };
  });

  return {
    headerErrors: [],
    rows,
  };
}
