import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateMultiAgentPolicy } from './multi-agent-policy-lib.mjs';

test('workspace pnpm security config changes trigger full multi-agent hardening', () => {
  assert.deepEqual(
    evaluateMultiAgentPolicy({
      eventName: 'pull_request',
      labels: [],
      changedFiles: ['pnpm-workspace.yaml'],
    }),
    {
      shouldRun: true,
      reason: 'high_risk_paths',
      matchedPaths: ['pnpm-workspace.yaml'],
    }
  );
});
