import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { decideExecutionMode } from './orchestrator-policy.mjs';

test('returns explicit single mode when requested', () => {
  const decision = decideExecutionMode({
    mode: 'single',
    complexity: 'high',
    estimatedCostUsd: 8,
    budgetUsd: 1,
    taskCount: 4,
    requiresBoundaryReview: true,
  });

  assert.equal(decision.selectedMode, 'single');
  assert.ok(decision.reasonCodes.includes('manual_mode_override'));
});

test('auto mode selects multi-agent for high-complexity boundary work', () => {
  const decision = decideExecutionMode({
    mode: 'auto',
    complexity: 'high',
    estimatedCostUsd: 3,
    budgetUsd: 6,
    taskCount: 3,
    requiresBoundaryReview: true,
  });

  assert.equal(decision.selectedMode, 'multi');
  assert.ok(decision.score >= 4);
});

test('auto mode selects single-agent when complexity is low and budget is tight', () => {
  const decision = decideExecutionMode({
    mode: 'auto',
    complexity: 'low',
    estimatedCostUsd: 3,
    budgetUsd: 2,
    taskCount: 1,
    requiresBoundaryReview: false,
  });

  assert.equal(decision.selectedMode, 'single');
  assert.ok(decision.reasonCodes.includes('budget_pressure'));
});

test('cli treats --requires-boundary-review as flag when followed by another option', () => {
  const scriptPath = fileURLToPath(new URL('./orchestrator-policy.mjs', import.meta.url));
  const child = spawnSync(
    process.execPath,
    [scriptPath, '--complexity', 'medium', '--requires-boundary-review', '--format', 'mode'],
    { encoding: 'utf8' }
  );

  assert.equal(child.status, 0);
  assert.equal(child.stdout.trim(), 'multi');
});
