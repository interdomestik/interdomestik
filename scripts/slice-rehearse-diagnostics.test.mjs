import assert from 'node:assert/strict';
import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';
import test from 'node:test';

import { canonicalJson, sha256 } from './slice-rehearse-canonical.mjs';
import { createRepository, manifest } from './slice-rehearse-cli-fixtures.mjs';
import {
  deriveRecoveryPlan,
  validateRecoveryPlan,
  withRehearsalDiagnostics,
} from './slice-rehearse-diagnostics.mjs';
import { buildRehearsalReport } from './slice-rehearse-envelope.mjs';
import { evaluateRehearsal } from './slice-rehearse-evaluator.mjs';
import {
  collectRepositoryFacts,
  runSliceRehearsal,
  runTrustedSliceRehearsal,
} from './slice-rehearse.mjs';

const digest = value => sha256(canonicalJson(value));
function reportFixture() {
  const normalized = manifest('a'.repeat(40));
  return buildRehearsalReport({
    normalized,
    repo: { origin: normalized.origin, writerLineCounts: {}, headSha: 'b'.repeat(40) },
    proposal: {
      allocation: { id: 'fixture', mode: 'exact' },
      budgetBytes: '{}\n',
      selfBytesDelta: 0,
      budget: { maxTrackedBytes: 1, maxTrackedFiles: 1, maxCategoryBytes: {} },
    },
    operationResolution: { facts: null },
    evidenceResult: { decisions: [], reusableLanes: [], missingLanes: [] },
    proofPlan: { reuse: [], run: [] },
    deficits: [{ code: 'proof:full-gate', coveredBy: 'apply_full_gate_label' }],
    authorityStops: [{ code: 'envelope:missing-operation', operations: ['apply_full_gate_label'] }],
    writerMapDigest: digest(normalized.writerPaths),
  });
}
// Use the serialized V1 fixture: absent optional repository facts are omitted by
// the legacy serializer, just as they are in retained report artifacts.
const report = () => JSON.parse(canonicalJson(reportFixture()));
function rehash(value) {
  value.reportSha256 = digest({ ...value, reportSha256: null });
  return value;
}

test('inert wrapper preserves report identity, bytes, digest and null authority envelope', () => {
  const original = report();
  const before = canonicalJson(original);
  const result = withRehearsalDiagnostics(original);
  assert.equal(result.report, original);
  assert.equal(canonicalJson(result.report), before);
  assert.equal(result.report.reportSha256, digest({ ...original, reportSha256: null }));
  assert.equal(result.report.operationalEnvelope, null);
  assert.deepEqual(Object.keys(result).sort(), ['procedures', 'recoveryPlan', 'report']);
  assert.equal(validateRecoveryPlan(result.recoveryPlan, original), result.recoveryPlan);
  assert.deepEqual(Object.keys(result.recoveryPlan.origin).sort(), [
    'budgetArtifactSha256',
    'reportSha256',
    'substrateDigest',
    'workflowDigest',
    'writerFactsDigest',
    'writerMapDigest',
  ]);
  assert.equal(result.recoveryPlan.origin.reportSha256, original.reportSha256);
  assert.ok(result.procedures.some(item => item.id === 'routine:apply_full_gate_label'));
  assert.ok(result.procedures.every(item => item.classification !== 'dispatchable'));
  assert.doesNotMatch(
    canonicalJson(result.recoveryPlan),
    /declared\.txt|node --test|procedure|authorityGranted/u
  );
});

test('known path blockers discard path text; arbitrary codes stay an explicit inert hold', () => {
  const original = report();
  original.deficits = [
    { code: 'modularity:line-cap:declared.txt', coveredBy: 'split_focused_test' },
    { code: '$(touch /tmp/diagnostic-injection)', command: 'rm -rf /', token: 'secret-value' },
  ];
  const result = withRehearsalDiagnostics(rehash(original));
  assert.deepEqual(result.recoveryPlan.blockers.map(item => item.code).sort(), [
    'diagnostic:unknown-hold',
    'envelope:missing-operation',
    'modularity:line-cap',
  ]);
  assert.doesNotMatch(
    canonicalJson(result.recoveryPlan),
    /touch|tmp|rm -rf|secret-value|declared\.txt/u
  );
  assert.ok(result.procedures.some(item => item.id === 'diagnostic:unknown-hold'));
});

for (const field of ['command', 'approvalToken', 'operationalEnvelope', 'authorization']) {
  test(`sidecar rejects injected ${field}`, () => {
    const original = report();
    const plan = deriveRecoveryPlan(original);
    plan[field] = 'arbitrary-executable-input';
    assert.throws(() => validateRecoveryPlan(plan, original), /keys/u);
    const nested = deriveRecoveryPlan(original);
    nested.blockers[0][field] = 'arbitrary-executable-input';
    assert.throws(() => validateRecoveryPlan(nested, original), /differs/u);
  });
}

for (const fault of [
  'stale-hash',
  'unknown-schema',
  'unknown-operation',
  'unknown-recovery',
  'unknown-field',
  'array-bound',
  'origin-drift',
]) {
  test(`diagnostics fail closed for ${fault}`, () => {
    const original = report();
    const plan = deriveRecoveryPlan(original);
    if (fault === 'stale-hash') original.deficits = [];
    if (fault === 'unknown-schema') rehash(Object.assign(original, { schemaVersion: 2 }));
    if (fault === 'unknown-operation') {
      original.deficits[0].coveredBy = '$(send-token)';
      rehash(original);
    }
    if (fault === 'unknown-recovery') plan.blockers[0].recoveryIds.push('execute:anything');
    if (fault === 'unknown-field') rehash(Object.assign(original, { command: 'injected' }));
    if (fault === 'array-bound')
      rehash(Object.assign(original, { authorityStops: Array(257).fill({ code: 'unknown' }) }));
    if (fault === 'origin-drift') plan.origin.writerFactsDigest = 'f'.repeat(64);
    assert.throws(() => validateRecoveryPlan(plan, original), /diagnostic|recovery|unknown/u);
  });
}

test('diagnostics reject lossy data, accessors, sparse arrays and authority injection', () => {
  for (const mutate of [
    value => {
      value.deficits = [undefined];
    },
    value => {
      value.deficits = Array(1);
    },
    value => {
      value.deficits = [Number.NaN];
    },
    value => {
      value.writers.routineOperations = ['unregistered-operation'];
      rehash(value);
    },
    value => {
      Object.defineProperty(value, 'bad', {
        get: () => assert.fail('getter executed'),
        enumerable: true,
      });
    },
    value => {
      value.operationalEnvelope = { authorityGranted: true };
      rehash(value);
    },
  ]) {
    const original = report();
    mutate(original);
    assert.throws(() => deriveRecoveryPlan(original), /diagnostic|unknown recovery ID/u);
  }
});

test('pure diagnostics perform zero provider, preparation, cleanup or filesystem effects', t => {
  const original = report();
  for (const [module, names] of [
    [childProcess.default, ['execFileSync', 'execSync', 'spawn', 'spawnSync']],
    [fs.default, ['writeFileSync', 'unlinkSync', 'rmSync', 'mkdirSync']],
  ])
    for (const name of names) t.mock.method(module, name, () => assert.fail(`effect: ${name}`));
  syncBuiltinESMExports();
  t.after(() => {
    t.mock.restoreAll();
    syncBuiltinESMExports();
  });
  const wrapped = withRehearsalDiagnostics(original);
  validateRecoveryPlan(wrapped.recoveryPlan, original);
});

test('default CLI stays byte-identical; opt-in wraps the same single collection and evaluation', t => {
  const fixture = createRepository(t);
  const manifestPath = join(fixture.root, 'manifest.json');
  fs.writeFileSync(manifestPath, canonicalJson(manifest(fixture.headSha)));
  let legacyBytes;
  const previousProofInputs = { hostInventory: 'previous' };
  const currentProofInputs = { hostInventory: 'current' };
  for (const diagnostics of [false, true]) {
    const calls = { facts: 0, operations: 0, evidence: 0, evaluate: 0 };
    const output = [],
      errors = [];
    let evaluated;
    const code = runSliceRehearsal({
      argv: ['--manifest', manifestPath, ...(diagnostics ? ['--diagnostics'] : [])],
      cwd: fixture.repository,
      readProtectedMain: () => fixture.headSha,
      collectFacts: options => {
        calls.facts++;
        return {
          ...collectRepositoryFacts(options),
          previousProofInputsByLane: { 'pr-e2e': previousProofInputs },
          currentProofInputsByLane: { 'pr-e2e': currentProofInputs },
        };
      },
      collectOperations: () => {
        calls.operations++;
        return null;
      },
      collectVerifiedEvidence: options => {
        assert.equal(options.previousProofInputs, previousProofInputs);
        assert.equal(options.currentProofInputs, currentProofInputs);
        calls.evidence++;
        return {};
      },
      evaluate: inputs => {
        calls.evaluate++;
        evaluated = evaluateRehearsal(inputs);
        return evaluated;
      },
      stdout: value => output.push(value),
      stderr: value => errors.push(value),
    });
    assert.equal(code, 2, errors.join(''));
    assert.deepEqual(errors, []);
    assert.deepEqual(calls, { facts: 1, operations: 1, evidence: 1, evaluate: 1 });
    assert.equal(output.length, 1);
    if (!diagnostics) {
      legacyBytes = output[0];
      assert.equal(legacyBytes, canonicalJson(evaluated));
    } else {
      const wrapped = JSON.parse(output[0]);
      assert.equal(canonicalJson(wrapped.report), legacyBytes);
      assert.equal(canonicalJson(wrapped.report), canonicalJson(evaluated));
      validateRecoveryPlan(wrapped.recoveryPlan, wrapped.report);
    }
  }
});

test('trusted request remains closed and diagnostics parsing rejects duplicate flags', () => {
  let admitted = 0;
  const errors = [];
  assert.equal(
    runTrustedSliceRehearsal(
      { cwd: '/repo', manifestPath: '/manifest', diagnostics: true },
      {
        admit: () => {
          admitted++;
        },
        stderr: value => errors.push(value),
      }
    ),
    1
  );
  assert.equal(admitted, 0);
  assert.match(errors[0], /strict request/u);
  assert.equal(
    runSliceRehearsal({
      argv: ['--manifest', '/manifest', '--diagnostics', '--diagnostics'],
      stdout: () => assert.fail('invalid CLI emitted output'),
      stderr: () => {},
    }),
    1
  );
});

test('missing trusted proof inputs are a bounded diagnostic prerequisite', () => {
  const original = report();
  original.deficits = [
    {
      code: 'evidence:heavy-proof-required',
      coveredBy: 'rerun_invalidated_proof',
      reason: 'current_proof_inputs_unavailable',
      missingInputLanes: ['pr-e2e'],
    },
  ];
  const wrapped = withRehearsalDiagnostics(rehash(original));
  const blocker = wrapped.recoveryPlan.blockers.find(
    item => item.code === 'evidence:heavy-proof-required'
  );
  assert.deepEqual(blocker.missingFacts, ['proof-evidence', 'current-proof-inputs']);
  assert.ok(wrapped.procedures.every(item => item.classification !== 'dispatchable'));
  validateRecoveryPlan(wrapped.recoveryPlan, original);
});
