import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluate } from '../rules.mjs';
import { RECEIPT_KEY } from '../storage-receipt-admission.mjs';
import { MIGRATION_JOURNAL, RECEIPT_SQL } from '../storage-receipt-prerequisite.mjs';
import {
  anchor,
  dark,
  edit,
  journal,
  journalEntry,
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

test('the scanner admits the reviewed B caller and re-export on D', () => {
  const result = scanStorage(dark, storage);
  assert.equal(result.telemetry.c1Admissions, 1);
  assert.deepEqual(privilegedFindings(result), []);
});

for (const [label, file, changed] of [
  ['a trailing newline in the 0114 SQL', RECEIPT_SQL, `${storage.blobs.get(RECEIPT_SQL)}\n`],
  [
    'a changed 0114 journal entry',
    MIGRATION_JOURNAL,
    journal({ ...journalEntry, when: journalEntry.when + 1 }),
  ],
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
  });
}

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
