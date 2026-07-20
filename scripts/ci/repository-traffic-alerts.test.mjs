import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import yaml from 'js-yaml';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const workflowPath = path.join(rootDir, '.github/workflows/repository-traffic-alerts.yml');
const source = fs.readFileSync(workflowPath, 'utf8');
const workflow = yaml.load(source);
const triggers = workflow.on ?? workflow.true;
const job = workflow.jobs.notify;
const script = job.steps[0].run.match(/node <<'NODE'\n([\s\S]+)\n[ \t]*NODE/u)?.[1] ?? '';

test('repository alerts run only on fork, daily schedule, or manual dispatch', () => {
  assert.deepEqual(Object.keys(triggers).sort(), ['fork', 'schedule', 'workflow_dispatch']);
  assert.equal(triggers.schedule.length, 1);
  assert.equal(triggers.workflow_dispatch.inputs.report.default, 'traffic');
  assert.deepEqual(workflow.permissions, { contents: 'read' });
  assert.equal(job['runs-on'], 'ubuntu-latest');
  assert.ok(job['timeout-minutes'] <= 5);
});

test('repository alerts use scoped secrets and never check out repository code', () => {
  assert.equal(job.env.RESEND_API_KEY, '${{ secrets.RESEND_API_KEY }}');
  assert.equal(job.env.TRAFFIC_READ_TOKEN, '${{ secrets.TRAFFIC_READ_TOKEN }}');
  assert.equal(job.env.ALERT_TO, '${{ vars.REPOSITORY_ALERT_EMAIL }}');
  assert.equal(job.env.ALERT_FROM, '${{ vars.RESEND_FROM_EMAIL }}');
  assert.ok(job.steps.every(step => !step.uses));
  assert.doesNotMatch(source, /actions\/checkout/u);
  assert.doesNotMatch(script, /\$\{\{\s*github\.event/u);
});

test('repository alerts report aggregate traffic and identifiable forks by email', () => {
  assert.match(script, /traffic\/\$\{kind\}/u);
  assert.match(script, /githubTraffic\('clones'\)/u);
  assert.match(script, /githubTraffic\('views'\)/u);
  assert.match(source, /github\.event\.forkee/u);
  assert.match(script, /https:\/\/api\.resend\.com\/emails/u);
  assert.match(script, /GitHub does not expose clone\/download identities/u);
  assert.doesNotThrow(() => new Function(`return (async () => {\n${script}\n});`));
});

test('repository alert files remain concise', () => {
  const lineCount = value => value.trimEnd().split('\n').length;
  assert.ok(lineCount(source) < 150, 'workflow must stay below 150 lines');
  assert.ok(lineCount(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8')) < 150);
});
