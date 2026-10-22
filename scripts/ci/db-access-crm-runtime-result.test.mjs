import assert from 'node:assert/strict';
import test from 'node:test';
import { validateCrmRuntimeResult } from './db-access-crm-runtime-result.mjs';
const contract = {
  id: 's8-crm-integration-proof-v1',
  version: 1,
  baselineCount: 604,
  runtimeRequired: true,
  acceptedReceiptInputs: false,
  runtimeAdmission: false,
  sources: { 'fixture.ts': {} },
  witnesses: {
    operations: [
      {
        identity: 'operation',
        file: 'fixture.ts',
        productionOperation: true,
        caseIds: ['crm-fixture'],
      },
    ],
    diagnostics: [
      { file: 'fixture.ts', reason: 'fixed', occurrences: 1, caseIds: ['crm-fixture'] },
    ],
  },
  cases: [
    {
      id: 'crm-fixture',
      kind: 'runtime',
      files: ['fixture.ts'],
      justification: 'Actual fixed case',
      requiredAssertions: ['own-row', 'foreign-denied'],
    },
  ],
  runtime: { requiredCases: ['crm-fixture'] },
};
const report = {
  version: 1,
  setupComplete: true,
  teardownComplete: true,
  runtimeAdmission: false,
  postgres: 160005,
  cases: [{ id: 'crm-fixture', status: 'passed', assertions: ['own-row', 'foreign-denied'] }],
};
test('completed exact assertions cover the enumerated production operation, without admission', () => {
  const result = validateCrmRuntimeResult(report, contract);
  assert.deepEqual(result.coverage, [{ identity: 'operation', caseIds: ['crm-fixture'] }]);
  assert.equal(result.runtimeAdmission, false);
});
for (const [name, mutate] of [
  ['missing case', r => (r.cases = [])],
  ['failed case', r => (r.cases[0].status = 'failed')],
  ['skipped case', r => (r.cases[0].status = 'skipped')],
  ['foreign case', r => (r.cases[0].id = 'crm-foreign')],
  ['missing assertion', r => r.cases[0].assertions.pop()],
  ['duplicate assertion', r => (r.cases[0].assertions = ['own-row', 'own-row'])],
  ['extra assertion', r => r.cases[0].assertions.push('unreviewed')],
  ['incomplete setup', r => (r.setupComplete = false)],
  ['incomplete teardown', r => (r.teardownComplete = false)],
  ['wrong database', r => (r.postgres = 150000)],
  ['premature admission', r => (r.runtimeAdmission = true)],
])
  test(name + ' is refused', () => {
    const changed = structuredClone(report);
    mutate(changed);
    assert.throws(() => validateCrmRuntimeResult(changed, contract), /crm proof/);
  });
