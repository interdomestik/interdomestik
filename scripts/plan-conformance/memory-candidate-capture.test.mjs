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
    {
      source_id: 'plan_evidence_custody_gap',
      trigger_match: { event_type: 'plan.evidence.custody_gap' },
      store_type: 'procedural',
      risk_class: 'high',
      promotion_rule: 'owner_approval',
      default_scope: { file_path: 'docs/plans/current-tracker.md' },
      verification_commands: ['pnpm plan:audit', 'pnpm plan:proof'],
    },
    {
      source_id: 'pilot_reset_gate_check_failure',
      trigger_match: { event_type: 'pilot.reset_gate.check_failure' },
      store_type: 'procedural',
      risk_class: 'high',
      promotion_rule: 'owner_approval',
      default_scope: { file_path: 'packages/database/test/rls-engaged.test.ts' },
      verification_commands: ['pnpm pilot:check', 'pnpm db:rls:test:required'],
    },
    {
      source_id: 'pilot_decision_observability_gap',
      trigger_match: { event_type: 'pilot.decision.observability_gap' },
      store_type: 'procedural',
      risk_class: 'high',
      promotion_rule: 'owner_approval',
      default_scope: { file_path: 'docs/pilot/PILOT_EVIDENCE_INDEX_TEMPLATE.md' },
      verification_commands: ['pnpm pilot:observability:record', 'pnpm pilot:decision:record'],
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

test('capture sanitizes scope to allowed keys only', () => {
  const payload = captureCandidateFromEvent(
    {
      event_type: 'release_gate.no_go',
      scope: {
        tenant: 'tenant_mk',
        unexpected_key: 'drop-me',
      },
    },
    sourceMap
  );

  assert.equal(payload.record.scope.tenant, 'tenant_mk');
  assert.equal(payload.record.scope.unexpected_key, undefined);
});

test('captures plan evidence custody gaps as procedural memory', () => {
  const payload = captureCandidateFromEvent(
    {
      event_type: 'plan.evidence.custody_gap',
      timestamp: '2026-03-05T10:00:00.000Z',
      lesson_hint: 'Do not count tracker progress without checked-in evidence.',
    },
    sourceMap
  );

  assert.equal(payload.source_id, 'plan_evidence_custody_gap');
  assert.equal(payload.record.store_type, 'procedural');
  assert.equal(payload.record.risk_class, 'high');
  assert.equal(payload.record.scope.file_path, 'docs/plans/current-tracker.md');
  assert.deepEqual(payload.record.verification_commands, ['pnpm plan:audit', 'pnpm plan:proof']);
});

test('captures pilot reset-gate failures as procedural memory', () => {
  const payload = captureCandidateFromEvent(
    {
      event_type: 'pilot.reset_gate.check_failure',
      timestamp: '2026-03-16T10:00:00.000Z',
      lesson_hint: 'Do not continue pilot execution when pilot:check is unstable.',
    },
    sourceMap
  );

  assert.equal(payload.source_id, 'pilot_reset_gate_check_failure');
  assert.equal(payload.record.store_type, 'procedural');
  assert.equal(payload.record.scope.file_path, 'packages/database/test/rls-engaged.test.ts');
  assert.deepEqual(payload.record.verification_commands, [
    'pnpm pilot:check',
    'pnpm db:rls:test:required',
  ]);
});

test('captures pilot observability-to-decision gaps with canonical file scope', () => {
  const payload = captureCandidateFromEvent(
    {
      event_type: 'pilot.decision.observability_gap',
      timestamp: '2026-03-16T10:05:00.000Z',
      lesson_hint: 'Verify observability proof before decision proof.',
    },
    sourceMap
  );

  assert.equal(payload.source_id, 'pilot_decision_observability_gap');
  assert.equal(payload.record.scope.file_path, 'docs/pilot/PILOT_EVIDENCE_INDEX_TEMPLATE.md');
  assert.deepEqual(payload.record.verification_commands, [
    'pnpm pilot:observability:record',
    'pnpm pilot:decision:record',
  ]);
});
