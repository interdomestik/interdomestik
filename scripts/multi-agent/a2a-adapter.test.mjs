import assert from 'node:assert/strict';
import test from 'node:test';

import { fromA2AResultEnvelope, toA2ATaskEnvelope } from './a2a-adapter.mjs';

test('maps internal task request to A2A-style envelope', () => {
  const envelope = toA2ATaskEnvelope({
    taskId: 'task-1',
    objective: 'Run release gates',
    role: 'gatekeeper',
    payload: { command: 'pnpm e2e:gate' },
    metadata: { tenant: 'ks' },
  });

  assert.equal(envelope.protocol, 'a2a');
  assert.equal(envelope.version, '0.2-draft');
  assert.equal(envelope.task.id, 'task-1');
  assert.equal(envelope.task.role, 'gatekeeper');
  assert.equal(envelope.messages[0].role, 'orchestrator');
  assert.equal(envelope.artifacts[0].mimeType, 'application/json');
});

test('maps A2A-style result envelope back to internal result shape', () => {
  const result = fromA2AResultEnvelope({
    protocol: 'a2a',
    version: '0.2-draft',
    task: {
      id: 'task-2',
      role: 'preflight-agent',
      status: 'succeeded',
      summary: 'All checks passed',
    },
    artifacts: [
      { type: 'json', mimeType: 'application/json', data: { logs: ['ok'] } },
    ],
  });

  assert.equal(result.taskId, 'task-2');
  assert.equal(result.role, 'preflight-agent');
  assert.equal(result.status, 'succeeded');
  assert.equal(result.summary, 'All checks passed');
  assert.deepEqual(result.artifacts[0], { logs: ['ok'] });
});
