import assert from 'node:assert/strict';
import test from 'node:test';

const CONTRACT_MODULES = [
  '../current-authority-format-audit.test.mjs',
  '../lean-current-authority-conformance.test.mjs',
  '../lean-current-authority-evidence.test.mjs',
  '../lean-current-authority-policy.test.mjs',
  '../lean-current-authority.test.mjs',
  '../plan-status.test.mjs',
];

await Promise.all(CONTRACT_MODULES.map(module => import(module)));

test('CI wrapper loads the exact Lean authority contract modules once', () => {
  assert.equal(CONTRACT_MODULES.length, 6);
  assert.equal(new Set(CONTRACT_MODULES).size, CONTRACT_MODULES.length);
  assert.ok(CONTRACT_MODULES.every(module => module.endsWith('.test.mjs')));
});
