import {
  MAX_UPLOAD_ROWS,
  type RosterRow,
} from '@interdomestik/domain-membership-billing/sponsors/roster-upload';
import { splitCsvLine } from './csv-line.core';

/** Reuses the interim uploader's quoted-comma/escaped-quote tokenizer. */
export function parseSponsorCsv(csv: string): RosterRow[] | null {
  const [header = '', ...lines] = csv
    .replace(/^\uFEFF/u, '')
    .split(/\r?\n/u)
    .map(line => line.trim())
    .filter(Boolean);
  const columns = splitCsvLine(header);
  const expected = ['firstName', 'lastName', 'email'];
  if (
    columns.length !== 3 ||
    !expected.every(name => columns.includes(name)) ||
    lines.length > MAX_UPLOAD_ROWS
  )
    return null;
  // This line-based parser rejects unclosed quotes, including multiline fields.
  if (lines.some(line => (line.match(/"/gu)?.length ?? 0) % 2 !== 0)) return null;
  const rows = lines.map(line => splitCsvLine(line));
  if (rows.some(row => row.length !== 3)) return null;
  return rows.map(row => ({
    firstName: row[columns.indexOf('firstName')] ?? '',
    lastName: row[columns.indexOf('lastName')] ?? '',
    email: row[columns.indexOf('email')] ?? '',
  }));
}
