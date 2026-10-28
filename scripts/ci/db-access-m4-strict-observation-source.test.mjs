import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';
import ts from 'typescript';
import { createHash } from 'node:crypto';
import { deriveM4StrictObservationSource } from './db-access-m4-strict-observation-source.mjs';
import { deriveM4PrivateRuntimeSource, FILES } from './db-access-m4-runtime-source.mjs';
import {
  bootstrapCases,
  retirementCases,
  contextCases,
  postureCases,
  typeCases,
} from './db-access-m4-runtime-negative-cases.fixture.mjs';
const P = fileURLToPath(new URL('../../', import.meta.url));
const proposal = P;
const read = file =>
  fs.readFileSync(
    fs.existsSync(path.join(proposal, file)) ? path.join(proposal, file) : path.join(P, file),
    'utf8'
  );
const strictFiles = {
  runtime: 'm4-private-runtime.ts',
  context: 'm4-private-runtime-context.ts',
  owner: 'm4-assignment-owner.ts',
  listener: 'm4-assignment-owner-http.ts',
  command: 'm4-runtime-command.ts',
  retirement: 'm4-runtime-retirement.ts',
  ownerCapture: 'm4-assignment-owner-capture.ts',
};
const source = Object.fromEntries(
  Object.entries(strictFiles).map(([r, f]) => [r, read('apps/web/src/server/operations/' + f)])
);
const input = value => Object.fromEntries(Object.entries(value).map(([k, v]) => [k + 'Source', v]));
const sha = text => createHash('sha256').update(text).digest('hex');
test('four finite strict source laws derive without execution or admission', () => {
  const result = deriveM4StrictObservationSource(input(source));
  assert.equal(result.sourceNodes.length, 14);
  assert.equal(result.runtimeAdmission, false);
  assert.equal(result.nativeAdmission, false);
  assert.equal(result.nextActionIngressQualified, false);
  assert(Object.isFrozen(result.sourceRecords));
});
test('formatting and comments preserve strict executable laws', () => {
  const value = Object.fromEntries(
    Object.entries(source).map(([k, v]) => [
      k,
      ts
        .createPrinter()
        .printFile(
          ts.createSourceFile('source.ts', '// review\n' + v, ts.ScriptTarget.ES2022, true)
        ),
    ])
  );
  assert.equal(deriveM4StrictObservationSource(input(value)).sourceNodes.length, 14);
});
const negatives = [
  [
    'runtime',
    'strict wrapper calls local constructor',
    'return createM4PrivateAssignmentRuntime(captured);',
    'return createM4LocalQualificationAssignmentRuntime(captured);',
  ],
  [
    'runtime',
    'request identity accepts arbitrary configuration',
    'strictObservationRequests.delete(configuration)',
    'true',
  ],
  [
    'runtime',
    'strict request disables strict TLS',
    'return construct(configuration, false, configuration)',
    'return construct(configuration, true, configuration)',
  ],
  [
    'runtime',
    'request cleanup omitted',
    'strictObservationRequests.delete(captured);',
    'void captured;',
  ],
  [
    'runtime',
    'ordinary production gets capture quota',
    '!loopbackQualification && strictObservationRequests.delete(configuration)',
    '!loopbackQualification',
  ],
  [
    'runtime',
    'all owners stored as strict',
    '(loopbackQualification ? qualifiedContextOwners : strictContextOwners)',
    'strictContextOwners',
  ],
  [
    'context',
    'strict take accepts undrained owner',
    '!owner || !owner.closed() || owner.active() !== 0 || owner.refused()',
    '!owner',
  ],
  [
    'owner',
    'owner wrapper calls local owner',
    'return await startM4PrivateAssignmentOwner(captured);',
    'return await startM4LocalQualificationAssignmentOwner(captured);',
  ],
  ['owner', 'owner request accepts clone', 'strictOwnerRequests.delete(configuration)', 'true'],
  [
    'owner',
    'owner bypasses observed runtime',
    '? createM4ObservedPrivateAssignmentRuntime(captured.runtime)',
    '? createM4PrivateAssignmentRuntime(captured.runtime)',
  ],
  ['owner', 'owner misses drain check', '!state.drained ||', 'false ||'],
  [
    'listener',
    'ordinary owner gets transcript capture',
    'captureLocal ? localTranscriptBudget : strictObservationBudget',
    'localTranscriptBudget',
  ],
  ['listener', 'strict transcript quota disabled', 'transcriptBudget!.used >= 2048', 'false'],
  ['listener', 'no finished delivery', "row.delivery = 'finished';", "row.delivery = 'pending';"],
];
for (const [role, label, needle, replacement] of negatives)
  test('fresh-digest valid-syntax semantic negative: ' + label, () => {
    assert(source[role].includes(needle), 'semantic mutation target exists');
    // Some local and strict closed predicates intentionally match; mutate the strict function only.
    const text =
      role === 'context'
        ? source[role].replace(/(export function readM4StrictAssignmentContexts[\s\S]*)/, tail =>
            tail.replace(needle, replacement)
          )
        : source[role].replace(needle, replacement);
    assert.notEqual(sha(text), sha(source[role]));
    assert.equal(
      ts.createSourceFile('variant.ts', text, ts.ScriptTarget.ES2022, true).parseDiagnostics.length,
      0
    );
    assert.throws(
      () => deriveM4StrictObservationSource(input({ ...source, [role]: text })),
      /source rejected/
    );
  });
const runtimeSources = Object.fromEntries(Object.entries(FILES).map(([r, f]) => [r, read(f)]));
test('existing complete private runtime source still derives all58 clauses', () => {
  const result = deriveM4PrivateRuntimeSource(input(runtimeSources));
  assert.equal(result.sourceNodes.length, 58);
  assert(result.assignmentContextSource.strictOwnerTable);
  assert.equal(result.runtimeAdmission, false);
});
const legacy = [
  ...retirementCases.map(x => ['retirement', ...x]),
  ...bootstrapCases.map(x => [
    x[1] && !runtimeSources.bootstrap.includes(x[1]) && runtimeSources.retirement.includes(x[1])
      ? 'retirement'
      : 'bootstrap',
    ...x,
  ]),
  ...contextCases.map(x => ['context', ...x]),
  ...postureCases.map(x => ['posture', ...x]),
  ...typeCases,
];
for (const [role, label, needle, replacement] of legacy)
  test('retained runtime negative: ' + label, () => {
    const prior = runtimeSources[role];
    if (needle) assert.equal(prior.split(needle).length, 2, 'one original target');
    let text = needle ? prior.replace(needle, () => replacement) : prior + replacement;
    if (replacement === 'const verifySession = cache(createCurrentStoreSessionVerifier({')
      text = text.replace(
        'issuerSecret: captured.issuerSecret,\n        });',
        'issuerSecret: captured.issuerSecret,\n        }));'
      );
    assert.notEqual(sha(text), sha(prior));
    assert.equal(
      ts.createSourceFile('variant.ts', text, ts.ScriptTarget.ES2022, true).parseDiagnostics.length,
      0
    );
    assert.throws(
      () => deriveM4PrivateRuntimeSource(input({ ...runtimeSources, [role]: text })),
      /source rejected/
    );
  });
