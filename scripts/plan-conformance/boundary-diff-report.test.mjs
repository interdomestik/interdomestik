import assert from 'node:assert/strict';
import test from 'node:test';

import { buildBoundaryDiffReport, classifyBoundaryFile } from './boundary-diff-report.mjs';

const TAXONOMY = {
  no_touch_patterns: ['apps/web/src/proxy.ts', '.github/workflows/**'],
  protected_patterns: ['apps/web/src/lib/canonical-routes.ts', 'apps/web/e2e/gate/**'],
  advisory_watch_patterns: ['apps/web/src/app/**', 'scripts/**'],
};

test('classifies files according to boundary taxonomy', () => {
  const noTouch = classifyBoundaryFile('apps/web/src/proxy.ts', TAXONOMY);
  const protectedBoundary = classifyBoundaryFile('apps/web/e2e/gate/tenant-resolution.spec.ts', TAXONOMY);
  const advisory = classifyBoundaryFile('apps/web/src/app/[locale]/layout.tsx', TAXONOMY);
  const unclassified = classifyBoundaryFile('README.temp.md', TAXONOMY);

  assert.equal(noTouch.classification, 'no_touch');
  assert.equal(protectedBoundary.classification, 'protected_boundary');
  assert.equal(advisory.classification, 'advisory_watch');
  assert.equal(unclassified.classification, 'unclassified');
});

test('report marks no-go and rollback when no-touch files are changed', () => {
  const report = buildBoundaryDiffReport({
    taxonomy: TAXONOMY,
    changedFiles: ['apps/web/src/proxy.ts', 'apps/web/src/lib/canonical-routes.ts'],
  });

  assert.equal(report.no_go, true);
  assert.equal(report.recommended_decision, 'rollback');
  assert.equal(report.summary.no_touch_touched, 1);
  assert.equal(report.summary.protected_touched, 1);
});

test('report suggests pause when protected boundaries change without no-touch violations', () => {
  const report = buildBoundaryDiffReport({
    taxonomy: TAXONOMY,
    changedFiles: ['apps/web/src/lib/canonical-routes.ts'],
  });

  assert.equal(report.no_go, false);
  assert.equal(report.recommended_decision, 'pause');
  assert.equal(report.summary.protected_touched, 1);
});
