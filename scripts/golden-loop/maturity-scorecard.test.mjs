import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  buildMaturityScorecard,
  buildMaturityScorecardFromAreas,
} from './maturity-scorecard.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '../..');

test('maturity scorecard computes current local PR readiness from enforced contracts', () => {
  const scorecard = buildMaturityScorecard(repoRoot);
  const scores = new Map(scorecard.areas.map(area => [area.name, area.score]));

  assert.equal(scorecard.ok, true);
  assert.equal(scorecard.overall, 10);
  assert.equal(scorecard.localReadiness, 10);
  assert.equal(scorecard.validatedMaturity, 9.4);
  assert.equal(scorecard.preMergeValidationCap, 9.4);
  assert.equal(scorecard.targetScore, 10);
  assert.equal(scorecard.evidenceMode, 'local-branch-readiness');
  assert.equal(scores.get('Reviewer route handling'), 10);
  assert.equal(scores.get('CI/release gate efficiency'), 10);
  assert.equal(scorecard.areas.every(area => area.failed.length === 0), true);
});

test('maturity scorecard fails closed when any area has a failed signal', () => {
  const areas = [
    { name: 'Governance/playbook design', score: 10, ok: true, failed: [], reason: 'pass' },
    {
      name: 'Reviewer route handling',
      score: 8,
      ok: false,
      failed: [{ label: 'route set' }],
      reason: 'fail',
    },
  ];
  const scorecard = buildMaturityScorecardFromAreas(areas);

  assert.equal(scorecard.ok, false);
  assert.equal(scorecard.localReadiness, 9);
  assert.equal(scorecard.validatedMaturity, 9);
});
