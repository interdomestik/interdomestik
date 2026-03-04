import assert from 'node:assert/strict';
import test from 'node:test';

import { captureCandidateFromEvent } from './memory-candidate-capture.mjs';

const sourceMap = {
  sources: [
    {
      source_id: 'release_gate_no_go',
      trigger_match: { event_type: 'release_gate.no_go' },
      store_type: 'episodic',
      risk_class: 'high',
      promotion_rule: 'hitl_required',
      default_scope: { file_path: 'scripts/release-gate/run.ts' },
      verification_commands: ['pnpm release:gate:prod'],
    },
  ],
};

test('captures candidate memory from matching event source', () => {
  const payload = captureCandidateFromEvent(
    {
      event_type: 'release_gate.no_go',
      timestamp: '2026-03-04T08:00:00.000Z',
      lesson_hint: 'Never bypass required suite checks in production.',
      scope: { tenant: 'tenant_mk' },
    },
    sourceMap
  );

  assert.equal(payload.source_id, 'release_gate_no_go');
  assert.equal(payload.record.status, 'candidate');
  assert.equal(payload.record.store_type, 'episodic');
  assert.equal(payload.record.promotion_rule, 'hitl_required');
  assert.equal(payload.record.scope.file_path, 'scripts/release-gate/run.ts');
  assert.equal(payload.record.scope.tenant, 'tenant_mk');
  assert.ok(payload.record.id.startsWith('mem_'));
});

test('fails capture when no source matches', () => {
  assert.throws(
    () =>
      captureCandidateFromEvent(
        {
          event_type: 'unknown.event',
        },
        sourceMap
      ),
    /no candidate capture source matched/
  );
});
