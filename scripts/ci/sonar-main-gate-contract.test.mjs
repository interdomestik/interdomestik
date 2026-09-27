import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import yaml from 'js-yaml';

const rootDir = path.resolve(new URL('../../', import.meta.url).pathname);
const readRepoText = relativePath => fs.readFileSync(path.join(rootDir, relativePath), 'utf8');

test('Sonar main gate tolerates delayed Automatic Analysis within its job timeout', () => {
  const workflow = yaml.load(readRepoText('.github/workflows/sonar-main-gate.yml'));
  const job = workflow.jobs['sonar-gate'];
  const awaitCheck = job.steps.find(
    step => step?.name === 'Await SonarCloud Code Analysis check (blocking on push)'
  );

  assert.ok(awaitCheck);
  const pollBudgetSeconds =
    Number(awaitCheck.env.SONAR_CHECK_MAX_RETRIES) *
    Number(awaitCheck.env.SONAR_CHECK_RETRY_DELAY_SECONDS);
  assert.ok(pollBudgetSeconds >= 30 * 60);
  assert.ok(pollBudgetSeconds <= (job['timeout-minutes'] - 10) * 60);
  assert.match(readRepoText('scripts/sonar-check-run-gate.sh'), /SONAR_CHECK_MAX_RETRIES:-180/);
});
