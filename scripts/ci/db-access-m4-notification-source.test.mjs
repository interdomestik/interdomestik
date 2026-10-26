import { notifierCases, ownerCases } from './db-access-m4-notification-negative-cases.fixture.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';
import ts from 'typescript';
import { deriveM4AssignmentNotification } from './db-access-m4-notification-source.mjs';
const sources = {
  notifierSource: fs.readFileSync(
    new URL('../../apps/web/src/server/operations/m4-assignment-postcommit.ts', import.meta.url),
    'utf8'
  ),
  notificationRuntimeSource: fs.readFileSync(
    new URL('../../apps/web/src/server/operations/m4-notification-runtime.ts', import.meta.url),
    'utf8'
  ),
};
const digest = s => createHash('sha256').update(s).digest('hex');
const receipts = [];
function replace(source, needle, replacement) {
  assert.equal(source.split(needle).length, 2, 'unique semantic mutation target');
  return source.replace(needle, replacement);
}
test('fixed modules derive 46 ordered semantic clauses without runtime admission', () => {
  const r = deriveM4AssignmentNotification(sources);
  assert.equal(r.runtimeAdmission, false);
  assert.equal(r.sourcePremiseOnly, true);
  assert.deepEqual(
    Object.values(r.namedOrderedFacts).map(x => x.length),
    [10, 16, 20]
  );
  assert(Object.isFrozen(r.facts));
  assert.equal(r.sourceNodes.length, 46);
  assert(r.premises.some(x => x.includes('uncancellable')));
  for (const clauses of Object.values(r.namedOrderedFacts))
    assert(clauses.every((v, i) => !i || v.start > clauses[i - 1].start));
});
test('comments and layout do not replace semantic identity', () => {
  const print = s =>
    ts
      .createPrinter({ newLine: ts.NewLineKind.LineFeed })
      .printFile(
        ts.createSourceFile(
          'x.ts',
          '// reviewed comment\n' + s,
          ts.ScriptTarget.ES2022,
          true,
          ts.ScriptKind.TS
        )
      );
  const original = deriveM4AssignmentNotification(sources),
    formatted = deriveM4AssignmentNotification({
      notifierSource: print(sources.notifierSource),
      notificationRuntimeSource: print(sources.notificationRuntimeSource),
    });
  assert.deepEqual(formatted.facts.notifierTree, original.facts.notifierTree);
  assert.deepEqual(formatted.facts.notificationRuntimeTree, original.facts.notificationRuntimeTree);
});
function negative(label, key, mutate) {
  test('repinned semantic negative: ' + label, () => {
    const source = mutate(sources[key]);
    assert.notEqual(source, sources[key]);
    const parsed = ts.createSourceFile(
      'negative.ts',
      source,
      ts.ScriptTarget.ES2022,
      true,
      ts.ScriptKind.TS
    );
    assert.equal(parsed.parseDiagnostics.length, 0, 'must be syntactically valid');
    const repinned = { ...sources, [key]: source },
      sha256 = digest(source);
    assert.notEqual(sha256, digest(sources[key]));
    assert.throws(
      () => deriveM4AssignmentNotification(repinned),
      error => error.message.includes('fixed imports/control/effects')
    );
    receipts.push({
      label,
      module: key,
      sourceSha256: sha256,
      syntacticallyValid: true,
      rejectedBy: 'fixed imports/control/effects',
      repinningDidNotAdmit: true,
    });
  });
}
for (const [label, needle, replacement] of notifierCases)
  negative(label, 'notifierSource', s => replace(s, needle, replacement));
for (const [label, needle, replacement] of ownerCases)
  negative(label, 'notificationRuntimeSource', s => replace(s, needle, replacement));
for (const [label, index] of [
  ['ledger share lock weakened', 0],
  ['claim share lock weakened', 1],
  ['staff share lock weakened', 2],
])
  negative(label, 'notifierSource', s => {
    let seen = 0;
    return s.replaceAll(".for('share')", x => (seen++ === index ? ".for('key share')" : x));
  });

negative('grouped optional pool method breaks short circuit', 'notificationRuntimeSource', s =>
  replace(s, 'pool?.end({ timeout: 0 })', '(pool?.end)({ timeout: 0 })')
);
