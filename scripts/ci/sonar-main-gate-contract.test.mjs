import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import yaml from 'js-yaml';

const rootDir = path.resolve(new URL('../../', import.meta.url).pathname);
const readRepoText = relativePath => fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
const readWorkflow = file => yaml.load(readRepoText(file));
const findStep = (steps, name) => steps.find(step => step?.name === name);

test('Sonar main gate tolerates delayed Automatic Analysis within its job timeout', () => {
  const workflow = yaml.load(readRepoText('.github/workflows/sonar-main-gate.yml'));
  const job = workflow.jobs['sonar-gate'];
  const awaitCheck = job.steps.find(
    step => step?.name === 'Await SonarCloud Code Analysis check (blocking on push)'
  );

  assert.ok(awaitCheck);
  const retries = Number(awaitCheck.env.SONAR_CHECK_MAX_RETRIES);
  const retryDelaySeconds = Number(awaitCheck.env.SONAR_CHECK_RETRY_DELAY_SECONDS);
  // The final attempt exits without sleeping, so only retries - 1 intervals are available.
  const pollBudgetSeconds = (retries - 1) * retryDelaySeconds;
  assert.ok(pollBudgetSeconds >= 30 * 60);
  assert.ok(pollBudgetSeconds <= (job['timeout-minutes'] - 10) * 60);
  assert.match(readRepoText('scripts/sonar-check-run-gate.sh'), /SONAR_CHECK_MAX_RETRIES:-181/);
});

test('Sonar main gate skips manual fallback for non-push SonarCloud runs while keeping push blocking intact', () => {
  const job = readWorkflow('.github/workflows/sonar-main-gate.yml').jobs['sonar-gate'];
  assert.ok(job);
  const validate = findStep(job.steps, 'Validate Sonar configuration');
  const strategy = findStep(job.steps, 'Decide Sonar main gate strategy');
  const awaitCheck = findStep(job.steps, 'Await SonarCloud Code Analysis check (blocking on push)');
  const fallback = findStep(job.steps, 'Run Sonar quality gate (manual fallback)');
  assert.ok(validate);
  assert.ok(strategy);
  assert.ok(awaitCheck);
  assert.ok(fallback);
  assert.equal(strategy.if, "env.SONAR_GATE_ENABLED == 'true'");
  for (const pattern of [
    /RUN_MANUAL_FALLBACK/,
    /sonarcloud\.io/,
    /SonarCloud Automatic Analysis owns mainline analysis/,
  ]) {
    assert.match(strategy.run, pattern);
  }
  assert.equal(awaitCheck.if, "github.event_name == 'push' && env.SONAR_GATE_ENABLED == 'true'");
  assert.equal(
    fallback.if,
    "github.event_name != 'push' && env.SONAR_GATE_ENABLED == 'true' && env.RUN_MANUAL_FALLBACK == 'true'"
  );
});
