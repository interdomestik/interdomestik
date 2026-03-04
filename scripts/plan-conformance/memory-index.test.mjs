import assert from 'node:assert/strict';
import test from 'node:test';

import { buildMemoryIndex } from './memory-index.mjs';

test('buildMemoryIndex groups keys deterministically', () => {
  const index = buildMemoryIndex([
    {
      id: 'mem_b',
      trigger_signature: 'sig.one',
      risk_class: 'high',
      scope: { file_path: 'a.ts', route: '/admin', tenant: 'tenant_mk' },
    },
    {
      id: 'mem_a',
      trigger_signature: 'sig.one',
      risk_class: 'high',
      scope: { file_path: 'a.ts', table: 'claim', tenant: 'tenant_mk' },
    },
  ]);

  assert.equal(index.count, 2);
  assert.deepEqual(index.keys.trigger_signature['sig.one'], ['mem_a', 'mem_b']);
  assert.deepEqual(index.keys.file_path['a.ts'], ['mem_a', 'mem_b']);
  assert.deepEqual(index.keys.tenant['tenant_mk'], ['mem_a', 'mem_b']);
  assert.deepEqual(index.keys.risk_class.high, ['mem_a', 'mem_b']);
  assert.deepEqual(index.keys.route['/admin'], ['mem_b']);
  assert.deepEqual(index.keys.table.claim, ['mem_a']);
});
