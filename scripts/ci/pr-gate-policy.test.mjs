import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluatePrGatePolicy, isHighRiskPath } from './pr-gate-policy-lib.mjs';

const PRIVACY_AND_AI_TRUST_PATHS = [
  'apps/web/src/lib/ai/policy-analyzer.ts',
  'apps/web/src/app/api/ai/runs/[id]/route.ts',
  'apps/web/src/app/api/privacy/data-deletion/route.ts',
  'apps/web/src/features/claims/components/ai-extraction-consent-field.tsx',
  'apps/web/src/components/privacy/cookie-consent-banner.tsx',
  'packages/domain-privacy/src/consent.ts',
  'packages/domain-ai/src/ai-call-context-required.compile-fail.ts',
];

function evaluate(overrides = {}) {
  return evaluatePrGatePolicy({
    eventName: 'pull_request',
    action: 'synchronize',
    draft: true,
    labels: [],
    changedFiles: ['apps/web/src/components/card.tsx'],
    changedFilesComplete: true,
    ...overrides,
  });
}

test('ordinary draft pull requests use the quick lane', () => {
  assert.deepEqual(evaluate(), {
    runFull: false,
    forceFull: false,
    reason: 'ordinary-draft',
    highRiskPaths: [],
  });
});

for (const changedPath of PRIVACY_AND_AI_TRUST_PATHS) {
  test(`privacy and AI trust path is high risk: ${changedPath}`, () => {
    assert.equal(isHighRiskPath(changedPath), true);
  });
}

test('ordinary UI and documentation paths are not high risk', () => {
  const ordinaryPaths = ['apps/web/src/components/card.tsx', 'docs/operations/overview.md'];

  for (const changedPath of ordinaryPaths) {
    assert.equal(isHighRiskPath(changedPath), false, changedPath);
  }
});

test('ready pull requests use the full lane', () => {
  assert.deepEqual(evaluate({ draft: false, action: 'ready_for_review' }), {
    runFull: true,
    forceFull: false,
    reason: 'pull-request-ready',
    highRiskPaths: [],
  });
});

test('full-gate label forces the full lane on a draft', () => {
  const result = evaluate({ labels: ['documentation', 'full-gate'] });

  assert.equal(result.runFull, true);
  assert.equal(result.forceFull, true);
  assert.equal(result.reason, 'full-gate-label');
});

test('high-risk paths force the full lane on a draft', () => {
  const paths = [
    'apps/web/src/proxy.ts',
    'apps/web/src/lib/proxy-gate.ts',
    'apps/web/src/lib/proxy-logic.ts',
    'apps/web/src/lib/proxy-session-state.ts',
    'apps/web/src/lib/auth.ts',
    'apps/web/src/server/domains/tenant-cache.ts',
    'apps/web/src/app/api/webhooks/paddle/route.ts',
    'apps/web/src/actions/subscription/cancel.ts',
    'packages/shared-auth/src/index.ts',
    'packages/database/src/schema.ts',
    'supabase/migrations/20260716_gate.sql',
    'packages/domain-membership-billing/src/paddle.ts',
    '.github/workflows/ci.yml',
    '.github/actions/setup/action.yml',
    'scripts/ci/workflow-contracts.test.mjs',
    'scripts/security-guard.mjs',
    'scripts/release-gate/run.ts',
    'scripts/pr-finalizer.sh',
    'pnpm-lock.yaml',
    'packages/domain-users/package.json',
  ];

  for (const changedPath of paths) {
    const result = evaluate({ changedFiles: [changedPath] });
    assert.equal(result.runFull, true, changedPath);
    assert.equal(result.forceFull, true, changedPath);
    assert.equal(result.reason, 'high-risk-change', changedPath);
    assert.deepEqual(result.highRiskPaths, [changedPath], changedPath);
  }
});

test('missing pull request evidence fails full', () => {
  const missingFiles = evaluate({ changedFiles: [], changedFilesComplete: false });
  assert.equal(missingFiles.runFull, true);
  assert.equal(missingFiles.forceFull, true);
  assert.equal(missingFiles.reason, 'changed-files-incomplete');

  const missingDraftState = evaluate({ draft: undefined });
  assert.equal(missingDraftState.runFull, true);
  assert.equal(missingDraftState.forceFull, true);
  assert.equal(missingDraftState.reason, 'pull-request-state-missing');
});

test('push and workflow dispatch events always run full', () => {
  for (const eventName of ['push', 'workflow_dispatch']) {
    const result = evaluate({ eventName, changedFiles: [], changedFilesComplete: false });
    assert.equal(result.runFull, true);
    assert.equal(result.forceFull, false);
    assert.equal(result.reason, `non-pull-request:${eventName}`);
  }
});
