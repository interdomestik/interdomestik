import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluate } from '../rules.mjs';
import { RECEIPT_CALLER, RECEIPT_KEY } from '../storage-receipt-admission.mjs';
import { MIGRATION_JOURNAL, RECEIPT_SQL } from '../storage-receipt-prerequisite.mjs';
import {
  DB_MANIFEST,
  PRINCIPAL_CONTEXT,
  VERIFIER,
  anchor,
  checkStorageAdmission as check,
  dark,
  edit,
  journal,
  journalEntry,
  predecessorReceiptSql,
  readerRecord,
  storage,
} from './path-c-test-support.mjs';

function scanStorage(base, candidate) {
  const result = evaluate({
    graph: candidate.graph,
    sources: candidate.sources,
    trusted: base.sources,
    schemaAdmission: { anchor, base, candidate },
    contracts: [],
    admissions: [readerRecord],
  });
  assert.equal(result.schemaAdmission.ok, true, result.schemaAdmission.reason);
  return result;
}

const privilegedFindings = result => result.violations.filter(({ rule }) => rule === 'R-a');
const controlFindings = result => result.violations.filter(({ rule }) => rule === 'R-d');

test('the scanner admits the reviewed B caller and re-export on D', () => {
  const result = scanStorage(dark, storage);
  assert.equal(result.telemetry.c1Admissions, 1);
  assert.deepEqual(privilegedFindings(result), []);
  assert.deepEqual(controlFindings(result), []);
});

test('the scanner refuses changed verifier controls and withholds every SQL exception', () => {
  const source = storage.sources.get(VERIFIER);
  assert.ok(source.includes('principal.role'));
  const changed = source.replace('principal.role', 'principal.userId');
  const result = scanStorage(dark, edit(storage, [[VERIFIER, changed]]));
  assert.ok(
    privilegedFindings(result).some(
      ({ detail }) => detail === `storage receipt byte mismatch: ${VERIFIER}`
    )
  );
  assert.equal(
    controlFindings(result).filter(
      ({ file, detail }) =>
        file === VERIFIER && detail === 'connection-control SQL outside tenant.ts'
    ).length,
    7
  );
});

for (const [label, file, changed] of [
  ['the previously admitted 0114 SQL', RECEIPT_SQL, predecessorReceiptSql],
  ['a trailing newline in the 0114 SQL', RECEIPT_SQL, `${storage.blobs.get(RECEIPT_SQL)}\n`],
  ['a missing journal', MIGRATION_JOURNAL, null],
  ['an empty journal', MIGRATION_JOURNAL, ''],
  ['an unparseable journal', MIGRATION_JOURNAL, '{"entries":'],
  ['a valid journal with no entries', MIGRATION_JOURNAL, journal()],
  [
    'a changed 0114 journal entry',
    MIGRATION_JOURNAL,
    journal({ ...journalEntry, when: journalEntry.when + 1 }),
  ],
  [
    'a duplicate 0114 index',
    MIGRATION_JOURNAL,
    journal(journalEntry, { ...journalEntry, tag: '0114_wrong' }),
  ],
  ['a duplicate 0114 tag', MIGRATION_JOURNAL, journal(journalEntry, { ...journalEntry, idx: 115 })],
]) {
  test(`${label} on a B candidate is refused and restoring the reviewed value passes`, () => {
    const drifted = edit(storage, [[file, changed]]);
    const result = scanStorage(storage, drifted);
    assert.equal(result.telemetry.c1Admissions, 0);
    assert.ok(
      result.violations.some(
        ({ rule, detail }) =>
          rule === 'C1' &&
          detail === 'storage reader requires exact 0114 SQL and journal entry on the candidate'
      )
    );
    assert.ok(
      privilegedFindings(result).some(
        ({ detail }) =>
          detail === 'storage receipt requires exact 0114 SQL and journal entry on the candidate'
      )
    );

    const restored = scanStorage(storage, edit(drifted, [[file, storage.blobs.get(file)]]));
    assert.equal(restored.telemetry.c1Admissions, 1);
    assert.deepEqual(privilegedFindings(restored), []);
    assert.deepEqual(controlFindings(restored), []);
  });
}

const has = ({ violations }, pattern) => violations.some(({ detail }) => pattern.test(detail));

test('exact receipt bytes still require the reviewed resolver bindings', () => {
  const redirected = edit(storage, [
    [PRINCIPAL_CONTEXT, 'export const withPrincipalTenantContext = () => {};\n'],
  ]);
  const redirectResult = check(dark, redirected);
  assert.equal(redirectResult.proof.ok, true, redirectResult.proof.reason);
  assert.equal(redirectResult.receipt, null);
  assert.ok(
    redirectResult.violations.some(
      ({ rule, detail }) =>
        rule === 'R-a' &&
        detail ===
          `storage receipt binding mismatch: ${RECEIPT_CALLER} imports withPrincipalTenantContext from @interdomestik/database/free-start-drafts`
    )
  );
  const manifest = JSON.parse(storage.blobs.get(DB_MANIFEST));
  delete manifest.exports['./claim-evidence-object-lock'];
  const missingExport = edit(storage, [[DB_MANIFEST, JSON.stringify(manifest)]]);
  const missingResult = check(dark, missingExport);
  assert.equal(missingResult.proof.ok, false, missingResult.proof.reason);
  assert.equal(missingResult.receipt, null);
  assert.ok(has(missingResult, /storage receipt binding mismatch/u));
});

for (const [label, file, source, detail] of [
  [
    'a second caller',
    'apps/web/src/path-c-extra-caller.ts',
    "import { recordClaimInboundObjectVerification } from '@interdomestik/database/claim-evidence-object-lock';\n" +
      'export const call = input => recordClaimInboundObjectVerification(input);\n',
    `unadmitted use of ${RECEIPT_KEY}`,
  ],
  [
    'an extra re-export',
    'packages/database/src/path-c-extra-export.ts',
    "export { recordClaimInboundObjectVerification } from './claim-inbound-verification';\n",
    `re-export of ${RECEIPT_KEY}`,
  ],
]) {
  test(`the scanner refuses ${label} while the reviewed receipt files remain exact`, () => {
    const result = scanStorage(dark, edit(storage, [[file, source]]));
    assert.deepEqual(
      privilegedFindings(result).map(violation => [violation.file, violation.detail]),
      [[file, detail]]
    );
  });
}
