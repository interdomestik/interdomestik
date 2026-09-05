import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { ROUTINE_OPERATIONS } from './slice-rehearse-operation-contracts.mjs';
import {
  OPERATION_CLASSES,
  OPERATION_REGISTRY,
  resolveRecoveryProcedures,
} from './slice-rehearse-operation-registry.mjs';

const entries = Object.values(OPERATION_REGISTRY);
const names = family =>
  entries
    .filter(item => item.family === family)
    .map(item => item.name)
    .sort();

test('registry accounts for every current routine and all safe-operation request names', () => {
  assert.deepEqual(names('routine'), [...ROUTINE_OPERATIONS].sort());
  const source = readFileSync(
    new URL('./slice-rehearse-operation-certificate.mjs', import.meta.url),
    'utf8'
  );
  const definitions = source.slice(
    source.indexOf('const DEFINITIONS = {'),
    source.indexOf('const CERTIFICATE_KEYS')
  );
  const executorNames = [...definitions.matchAll(/^  ([a-z_]+):/gmu)].map(match => match[1]).sort();
  assert.equal(executorNames.length, 6);
  assert.deepEqual(names('executor'), executorNames);
  assert.deepEqual(OPERATION_CLASSES, [
    'dispatchable',
    'read-only',
    'manual',
    'unsupported',
    'retired',
  ]);
  assert.ok(entries.every(item => OPERATION_CLASSES.includes(item.classification)));
  assert.ok(entries.every(item => item.classification !== 'dispatchable'));
});

test('routine grants and command construction cannot claim D9 dispatch guarantees', () => {
  for (const name of ROUTINE_OPERATIONS) {
    const row = OPERATION_REGISTRY[`routine:${name}`];
    assert.ok(['manual', 'unsupported'].includes(row.classification));
    assert.ok(row.missingFacts.length > 0);
  }
  const merge = OPERATION_REGISTRY['executor:conditional_merge'];
  assert.deepEqual(merge.missingFacts, [
    'current-authorization',
    'conditional-provider',
    'durable-issuer',
  ]);
  assert.match(merge.description, /independently supplied/u);
  assert.match(OPERATION_REGISTRY['executor:branch_push'].description, /no expected-old-ref CAS/u);
  assert.equal(
    OPERATION_REGISTRY['routine:bounded_force_with_lease_rebuild'].classification,
    'unsupported'
  );
});

test('effectful diagnostic, prepare and cleanup families stay explicit and non-dispatchable', () => {
  for (const name of [
    'doctor',
    'dev:clean',
    'boot:dev',
    'boot:local',
    'boot:e2e',
    'db:migrate',
    'db:push:local',
    'seed:e2e',
    'ci-local-lowdisk',
    'docker-gate',
    'slice:cleanup',
  ]) {
    const row = OPERATION_REGISTRY[`entrypoint:${name}`];
    assert.ok(row, name);
    assert.ok(['manual', 'unsupported'].includes(row.classification), name);
    assert.ok(row.missingFacts.includes('resource-ownership'), name);
  }
  assert.match(
    OPERATION_REGISTRY['entrypoint:doctor'].description,
    /restart Docker.*migrate.*remove containers/u
  );
  assert.match(
    OPERATION_REGISTRY['entrypoint:ci-local-lowdisk'].description,
    /global unused-container/u
  );
  assert.equal(OPERATION_REGISTRY['diagnostic:recollect'].classification, 'read-only');
  assert.equal(OPERATION_REGISTRY['diagnostic:unknown-hold'].classification, 'read-only');
  assert.equal(entries.filter(item => item.classification === 'retired').length, 0);
});

test('fixed procedures reject injected IDs and cannot be rewritten by callers', () => {
  for (const id of [
    'unknown',
    'routine:rm -rf /',
    'executor:$(send-token)',
    '__proto__',
    { command: 'execute' },
  ])
    assert.throws(() => resolveRecoveryProcedures([id]), /unknown recovery ID/u);
  assert.throws(
    () => resolveRecoveryProcedures(Array(100).fill('diagnostic:recollect')),
    /invalid/u
  );
  assert.throws(
    () => resolveRecoveryProcedures(['diagnostic:recollect', 'diagnostic:recollect']),
    /unique/u
  );
  const [procedure] = resolveRecoveryProcedures(['routine:task_owned_cleanup']);
  assert.throws(() => {
    procedure.classification = 'dispatchable';
  }, TypeError);
  assert.throws(() => {
    procedure.missingFacts.push('injected');
  }, TypeError);
  assert.ok(entries.every(item => Object.isFrozen(item)));
});
