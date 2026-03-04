import assert from 'node:assert/strict';
import test from 'node:test';

import { computeDeterministicMemoryId } from './memory-id.mjs';

function sampleRecord(overrides = {}) {
  return {
    store_type: 'episodic',
    trigger_signature: 'no_go.release_gate',
    risk_class: 'high',
    scope: {
      tenant: 'tenant_mk',
      file_path: 'scripts/release-gate/run.ts',
    },
    lesson: 'Never skip required production checks.',
    ...overrides,
  };
}

test('deterministic memory id is stable for identical semantic payload', () => {
  const a = sampleRecord();
  const b = sampleRecord({
    scope: {
      file_path: 'scripts/release-gate/run.ts',
      tenant: 'tenant_mk',
    },
  });

  const idA = computeDeterministicMemoryId(a);
  const idB = computeDeterministicMemoryId(b);

  assert.equal(idA, idB);
  assert.ok(idA.startsWith('mem_'));
});

test('deterministic memory id changes when seed fields change', () => {
  const base = sampleRecord();
  const changed = sampleRecord({ lesson: 'Check skips are disallowed in production.' });

  assert.notEqual(computeDeterministicMemoryId(base), computeDeterministicMemoryId(changed));
});
