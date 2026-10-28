import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import yaml from 'js-yaml';

const root = path.resolve(new URL('../../', import.meta.url).pathname);
const readWorkflow = file => yaml.load(fs.readFileSync(path.join(root, file), 'utf8'));
const findStep = (steps, name) => steps.find(candidate => candidate.name === name);
const findStepIndex = (steps, name) => {
  const index = steps.findIndex(candidate => candidate.name === name);
  assert.notEqual(index, -1, `Missing step: ${name}`);
  return index;
};
const normalizeNeeds = needs =>
  Array.isArray(needs) ? needs : typeof needs === 'string' ? [needs] : [];

test('Pilot gate heavy runner depends on preflight before Postgres, setup, build, and release-gate work', () => {
  const pilotGateWorkflow = readWorkflow('.github/workflows/pilot-gate.yml');
  const pilotGateJob = pilotGateWorkflow.jobs['pilot-gate-runner'];
  assert.ok(pilotGateJob);
  const steps = pilotGateJob.steps;
  const setupIndex = steps.findIndex(step => step?.uses === './.github/actions/setup');
  const manualSonarIndex = findStepIndex(steps, 'Run Sonar quality gate (manual fallback)');
  const prepareDbIndex = findStepIndex(steps, 'Prepare CI database');
  const buildIndex = findStepIndex(steps, 'Build web standalone artifact');
  assert.deepEqual(normalizeNeeds(pilotGateJob.needs), ['pilot-gate-preflight']);
  assert.equal(pilotGateJob.if, "needs.pilot-gate-preflight.outputs.run_broad == 'true'");
  assert.equal(pilotGateJob.env.DATABASE_URL_RLS, undefined);
  const credentials = findStep(steps, 'Generate ephemeral E2E credentials');
  assert.equal(credentials.if, undefined);
  assert.match(credentials.run, /bash scripts\/ci\/export-e2e-rls\.sh/u);
  assert.ok(steps.indexOf(credentials) < prepareDbIndex);
  const preparation = findStep(steps, 'Prepare CI database').run;
  assert.match(
    preparation,
    /pnpm db:migrate\s+node scripts\/ci\/run-e2e-seed-admin\.mjs seed\s+node scripts\/ci\/run-e2e-seed-admin\.mjs assert/u
  );
  assert.doesNotMatch(preparation, /pnpm seed:/u);
  assert.equal(pilotGateJob.env.NODE_OPTIONS, '--max-old-space-size=4096');
  for (const index of [setupIndex, manualSonarIndex, prepareDbIndex, buildIndex]) {
    assert.ok(index >= 0);
  }
  assert.equal(
    findStep(steps, 'Run Sonar quality gate (manual fallback)').if,
    "env.SONAR_GATE_ENABLED == 'true' && (github.event_name != 'pull_request' || needs.pilot-gate-preflight.outputs.needs_manual_sonar_fallback == 'true')"
  );
  assert.ok(setupIndex < prepareDbIndex);
  assert.ok(manualSonarIndex < prepareDbIndex);
  assert.ok(manualSonarIndex < buildIndex);
  assert.equal(findStep(steps, 'Evaluate validation surface'), undefined);
  assert.equal(findStep(steps, 'Validate required gate secrets'), undefined);
  assert.equal(findStep(steps, 'Await SonarCloud Code Analysis check'), undefined);
});
