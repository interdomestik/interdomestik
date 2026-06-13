import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluatePackageJsonValidationSurface,
  evaluateValidationSurface,
} from './validation-surface-policy-lib.mjs';

function packageSurface(beforeJson, afterJson) {
  return evaluatePackageJsonValidationSurface({
    beforeContent: JSON.stringify(beforeJson),
    afterContent: JSON.stringify(afterJson),
  });
}

test('safe local tooling package scripts skip heavy validation', () => {
  const packageJsonSurface = packageSurface(
    { scripts: { check: 'pnpm lint' } },
    {
      scripts: {
        check: 'pnpm lint',
        'docker:reclaim': 'bash scripts/docker-reclaim.sh light',
        'ci:local:quick': 'bash scripts/ci-local-parity.sh quick',
      },
    }
  );

  assert.deepEqual(
    evaluateValidationSurface({
      eventName: 'pull_request',
      changedFiles: ['package.json', 'scripts/docker-reclaim.sh'],
      packageJsonSurface,
    }),
    {
      shouldRun: false,
      reason: 'non_product_only_pr',
      nonProductOnlyPaths: ['package.json', 'scripts/docker-reclaim.sh'],
    }
  );
});

test('package analysis is required before package.json can skip heavy validation', () => {
  assert.deepEqual(
    evaluateValidationSurface({ eventName: 'pull_request', changedFiles: ['package.json'] }),
    {
      shouldRun: true,
      reason: 'runtime_sensitive_surface',
      nonProductOnlyPaths: [],
    }
  );
});

test('runtime package scripts and dependency changes still run heavy validation', () => {
  const prVerifySurface = packageSurface(
    { scripts: { 'pr:verify': 'pnpm check:fast' } },
    { scripts: { 'pr:verify': 'pnpm check:fast && pnpm coverage:gate' } }
  );
  const dependencySurface = packageSurface(
    { devDependencies: { vitest: '^3.0.0' } },
    { devDependencies: { vitest: '^3.1.0' } }
  );

  for (const packageJsonSurface of [prVerifySurface, dependencySurface]) {
    assert.deepEqual(
      evaluateValidationSurface({
        eventName: 'pull_request',
        changedFiles: ['package.json', 'docs/runbook.md'],
        packageJsonSurface,
      }),
      {
        shouldRun: true,
        reason: 'runtime_sensitive_surface',
        nonProductOnlyPaths: ['docs/runbook.md'],
      }
    );
  }
});
