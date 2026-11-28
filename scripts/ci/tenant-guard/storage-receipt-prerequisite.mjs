import { sha256 } from './rules-digest.mjs';

const TAG = '0114_wp12_1_inbound_documents';
export const RECEIPT_SQL = `packages/database/drizzle/${TAG}.sql`;
export const MIGRATION_JOURNAL = 'packages/database/drizzle/meta/_journal.json';
const SQL_SHA256 = 'd0516c13878ef0be2ba4a3ba46580bd49bbd24c05b18a65a329633886a5e9336';
const ENTRY = Object.freeze({
  idx: 114,
  version: '7',
  when: 1795724107768,
  tag: TAG,
  breakpoints: true,
});

export function hasReceiptMigration({ blobs }) {
  const sql = blobs.get(RECEIPT_SQL);
  if (sql === undefined || sha256(sql) !== SQL_SHA256) return false;
  let journal;
  try {
    journal = JSON.parse(blobs.get(MIGRATION_JOURNAL));
  } catch {
    return false;
  }
  if (!Array.isArray(journal?.entries)) return false;
  const matches = journal.entries.filter(entry => entry?.idx === ENTRY.idx || entry?.tag === TAG);
  return (
    matches.length === 1 &&
    Object.keys(matches[0]).length === Object.keys(ENTRY).length &&
    Object.entries(ENTRY).every(([key, value]) => matches[0][key] === value)
  );
}

export function storageReceiptPrerequisiteProblem(schemaAdmission) {
  if (!schemaAdmission?.storageReceiptBase)
    return 'requires exact WP-12.1 schema and 0114 on the protected base';
  if (!schemaAdmission.storageReceiptCandidate)
    return 'requires exact 0114 SQL and journal entry on the candidate';
  return null;
}
