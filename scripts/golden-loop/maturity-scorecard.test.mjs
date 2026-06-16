import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildMaturityScorecard } from './maturity-scorecard.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '../..');

test('maturity scorecard computes current local PR readiness from enforced contracts', () => {
  const scorecard = buildMaturityScorecard(repoRoot);
  const scores = new Map(scorecard.areas.map(area => [area.name, area.score]));

  assert.equal(scorecard.ok, true);
  assert.equal(scorecard.overall, 9.3);
  assert.equal(scorecard.preMergeCap, 9.4);
  assert.equal(scores.get('Reviewer route handling'), 9.4);
  assert.equal(scores.get('CI/release gate efficiency'), 9.2);
  assert.equal(scorecard.areas.every(area => area.failed.length === 0), true);
});
