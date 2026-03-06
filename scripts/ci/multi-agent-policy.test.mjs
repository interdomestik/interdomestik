import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';

import { evaluateMultiAgentPolicy } from './multi-agent-policy-lib.mjs';
import { createTempRoot, runScript, writeFile } from '../plan-test-helpers.mjs';

test('manual dispatch always runs full multi-agent hardening', () => {
  assert.deepEqual(
    evaluateMultiAgentPolicy({
      eventName: 'workflow_dispatch',
      labels: [],
      changedFiles: [],
    }),
    {
      shouldRun: true,
      reason: 'manual_dispatch',
      matchedPaths: [],
    }
  );
});

test('explicit CI label forces full multi-agent hardening', () => {
  assert.deepEqual(
    evaluateMultiAgentPolicy({
      eventName: 'pull_request',
      labels: ['ci:multi-agent'],
      changedFiles: ['apps/web/src/features/member/home.tsx'],
    }),
    {
      shouldRun: true,
      reason: 'label:ci:multi-agent',
      matchedPaths: [],
    }
  );
});

test('high-risk multi-agent infrastructure changes trigger full multi-agent hardening', () => {
  assert.deepEqual(
    evaluateMultiAgentPolicy({
      eventName: 'pull_request',
      labels: [],
      changedFiles: [
        'scripts/multi-agent/orchestrator.sh',
        'apps/web/src/features/member/home.tsx',
      ],
    }),
    {
      shouldRun: true,
      reason: 'high_risk_paths',
      matchedPaths: ['scripts/multi-agent/orchestrator.sh'],
    }
  );
});

test('routing authority changes trigger full multi-agent hardening', () => {
  assert.deepEqual(
    evaluateMultiAgentPolicy({
      eventName: 'pull_request',
      labels: [],
      changedFiles: ['apps/web/src/proxy.ts'],
    }),
    {
      shouldRun: true,
      reason: 'high_risk_paths',
      matchedPaths: ['apps/web/src/proxy.ts'],
    }
  );
});

test('normal product changes skip full multi-agent hardening', () => {
  assert.deepEqual(
    evaluateMultiAgentPolicy({
      eventName: 'pull_request',
      labels: [],
      changedFiles: [
        'apps/web/src/features/member/home.tsx',
        'apps/web/src/features/member/home.test.tsx',
      ],
    }),
    {
      shouldRun: false,
      reason: 'default_skip_non_risky_pr',
      matchedPaths: [],
    }
  );
});

test('CLI prints GitHub output fields for risky PR changes', () => {
  const root = createTempRoot('multi-agent-policy-cli-');
  const eventPath = path.join(root, 'event.json');
  const changedFilesPath = path.join(root, 'changed-files.txt');

  writeFile(
    root,
    'event.json',
    JSON.stringify({
      pull_request: {
        labels: [],
      },
    })
  );
  writeFile(root, 'changed-files.txt', 'scripts/multi-agent/orchestrator.sh\n');

  const result = runScript('scripts/ci/multi-agent-policy.mjs', root, [
    '--event-name',
    'pull_request',
    '--event-path',
    eventPath,
    '--changed-files-path',
    changedFilesPath,
  ]);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^should_run=true$/m);
  assert.match(result.stdout, /^reason=high_risk_paths$/m);
  assert.match(result.stdout, /matched_paths=\["scripts\/multi-agent\/orchestrator\.sh"\]/);
});
