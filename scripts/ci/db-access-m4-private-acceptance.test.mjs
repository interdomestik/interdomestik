import test from 'node:test';
import assert from 'node:assert/strict';
import { acceptanceFixture } from './db-access-m4-private-test.fixture.mjs';
import * as privateData from './db-access-m4-private-acceptance-data.mjs';
import { lineageObservationKey } from './db-access-m4-factory-context-rule.mjs';
import { executionFixture } from './db-access-m4-private-test.fixture.mjs';
import * as sourceRule from './db-access-m4-factory-source-rule.mjs';
import FIXED from './db-access-m4-factory-contract.json' with { type: 'json' };
const project = privateData.projectFixedPrivateAcceptance;
const active = input =>
  input.native.rawGraph.m4Contexts.affectedLineage.batches.find(batch => batch.observations.length);
function rekey(batch) {
  for (let i = 0; i < batch.observations.length; i++)
    batch.entryEmissions[i].observationKey = lineageObservationKey(batch.observations[i]);
}
test('complete fixed construction conditionally accepts exact two current factory rows and exact occurrences', () => {
  const input = acceptanceFixture(),
    before = JSON.stringify(input),
    result = project(input);
  assert.equal(result.acceptedOriginalIdentities.length, 2);
  assert.equal(result.acceptedContextOccurrences, 5);
  assert.deepEqual(result.acceptedOriginalInventoryIndices, [55, 56]);
  assert.equal(result.originalSelectedCohort.identities.endExclusive, 55);
  assert.equal(result.originalSelectedCohort.contexts.endExclusive, 200);
  assert.equal(result.originalSelectedCohort.contextOccurrences, 1685);
  const original = JSON.parse(before).native.rawGraph.m4Contexts;
  assert.deepEqual(
    input.native.rawGraph.m4Contexts.selectedIdentities,
    original.selectedIdentities
  );
  assert.deepEqual(input.native.rawGraph.m4Contexts.observations, original.observations);
  assert.equal(new Set(original.selectedIdentities).size, 55);
  assert.equal(original.observations.length, 200);
  assert.equal(
    original.observations.reduce((n, row) => n + row.occurrences, 0),
    1685
  );
  assert.equal(result.residuals.rawFailures.retainedCount, 55);
  assert.equal(result.residuals.rawDiagnostics.retainedOccurrences, 7);
  assert.equal(result.nativeAdmission, false);
  assert.equal(result.fullM4Complete, false);
  assert.equal(JSON.stringify(input), before);
});
test('valid fixed source plus foreign native origin is a semantic refutation, not source-hash refusal', () => {
  const input = acceptanceFixture(),
    batch = active(input);
  batch.observations[0].origin = batch.roots.find(root => root !== batch.observations[0].origin);
  batch.entryEmissions[0].origin = batch.observations[0].origin;
  rekey(batch);
  const result = project(input);
  assert.equal(result.acceptedOriginalIdentities.length, 1);
  assert.equal(result.retainedFactoryIdentities.length, 1);
  assert.match(result.retainedFactoryContexts[0].residualReasons[0], /foreign source/u);
});
test('a second unqualified context prevents whole identity credit despite one qualified occurrence', () => {
  const input = acceptanceFixture(),
    batch = active(input),
    row = structuredClone(batch.observations[0]);
  row.origin = batch.roots.find(root => root !== row.origin);
  batch.observations.push(row);
  const emission = structuredClone(batch.entryEmissions[0]);
  emission.origin = row.origin;
  emission.observationKey = lineageObservationKey(row);
  batch.entryEmissions.push(emission);
  const result = project(input);
  assert.equal(result.acceptedOriginalIdentities.length, 1);
  assert.equal(result.decisions[0].contexts[0].qualified, true);
  assert.equal(result.decisions[0].accepted, false);
  assert.equal(result.acceptedContextOccurrences, 3);
});
test('unknown/nonempty/recursive frames, unexpected invocation and absent contexts remain residual', () => {
  for (const mutate of [
    batch => {
      batch.observations[0].context = 'lineage-frame:unknown';
    },
    batch => {
      batch.frames.push({ id: 'f', status: 'available', bindings: [{}] });
      batch.observations[0].context = 'f';
    },
    batch => {
      batch.frames.push({ id: 'f', status: 'recursive', bindings: [] });
      batch.observations[0].context = 'f';
    },
    batch => {
      batch.observations[0].invocation = ['foreign.ts', 1, 2, 214];
    },
  ]) {
    const input = acceptanceFixture(),
      batch = active(input);
    mutate(batch);
    rekey(batch);
    assert.equal(project(input).acceptedOriginalIdentities.length, 1);
  }
  const input = acceptanceFixture(),
    batch = active(input);
  batch.observations.shift();
  batch.entryEmissions.shift();
  assert.equal(project(input).acceptedOriginalIdentities.length, 1);
});
test('missing or inflated original entry emissions cannot clear the return obligation', () => {
  for (const mutate of [
    batch => {
      batch.entryEmissions.shift();
    },
    batch => {
      batch.entryEmissions[0].occurrences++;
    },
  ]) {
    const input = acceptanceFixture();
    mutate(active(input));
    assert.equal(project(input).acceptedOriginalIdentities.length, 1);
  }
});
test('original diagnostic key groups conserve partial occurrences without inventing row allocation', () => {
  const input = acceptanceFixture();
  input.native.raw.diagnostics[0].occurrences += 4;
  input.native.raw.diagnosticCount += 4;
  const result = project(input),
    group = result.diagnosticKeyGroups[0];
  assert.equal(group.originalOccurrences, 9);
  assert.equal(group.acceptedOccurrences, 5);
  assert.equal(group.retainedOccurrences, 4);
  assert.equal(result.residuals.rawDiagnostics.retainedTuples, 2);
  assert.match(group.allocation, /no invented per-row/u);
});
test('event, policy, current inventory index/owner or diagnostic overclaim refuse', () => {
  for (const mutate of [
    input => {
      input.event.context.eventName = 'push';
    },
    input => {
      input.ordinary.providerPolicySha256 = 'foreign';
    },
    input => {
      input.native.inventory.entries[55].owner = ['foreign.ts', 0, 1, 220];
    },
    input => {
      input.native.raw.diagnostics[0].occurrences = 1;
    },
  ]) {
    const input = acceptanceFixture();
    mutate(input);
    assert.throws(() => project(input));
  }
});

test('exact retained callbacks derive current native factory IDs and mandatory registry path', () => {
  const result = sourceRule.deriveFixedFactoryConstruction(executionFixture());
  assert.equal(result.factories.length, 2);
  assert.deepEqual(
    result.factories.map(f => f.owner[1]),
    [856, 1023]
  );
  assert.equal(
    result.factories[0].identity,
    '3abe201e80665b5f1d95dd025e8694e386fd4eedab84512fa06b501c27ad7353'
  );
  assert.equal(
    result.factories[1].identity,
    '23045f68d4b176bb5a96c7ce1100eb6639006081e00ffbb87a42f31871abbab0'
  );
  assert.match(result.executionDerivation, /no factory V8 claim/u);
});
test('changed source, missing retained callback, failed case and ambient partition refuse', () => {
  for (const mutate of [
    x => {
      x.sources.registry.text = x.sources.registry.text.replace('await factory()', 'factory()');
    },
    x => {
      x.retainedSegments = [];
    },
    x => {
      x.actualCases[0].state = 'fail';
    },
    x => {
      x.ordinaryPartition.ambient.push(x.ordinaryPartition.capsule[0]);
    },
    x => {
      x.mockSpecifiers.pop();
    },
  ]) {
    const x = executionFixture();
    mutate(x);
    assert.throws(() => sourceRule.deriveFixedFactoryConstruction(x));
  }
});
test('fixed imported contract is deeply immutable before any acceptance projection', () => {
  assert.equal(Object.isFrozen(FIXED), true);
  assert.equal(Object.isFrozen(FIXED.pins.originalTest), true);
  assert.equal(Object.isFrozen(FIXED.factoryIds), true);
  assert.throws(() => {
    FIXED.pins.originalTest.sha256 = 'forged';
  }, TypeError);
});
