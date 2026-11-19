import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import yaml from 'js-yaml';

import { REPO_ROOT } from './fixtures/server-mutation-check/harness.mjs';

const WORKFLOW = '.github/workflows/server-mutation-report.yml';
const read = relative => fs.readFileSync(path.join(REPO_ROOT, relative), 'utf8');
const workflow = () => yaml.load(read(WORKFLOW));
const stepsOf = () => workflow().jobs['server-mutation-report'].steps;

test('advisory workflow: non-draft pull requests and pushes to main, read-only, no secrets or remote cache', () => {
  const source = read(WORKFLOW);
  const wf = workflow();
  assert.deepEqual(Object.keys(wf.on).sort(), ['pull_request', 'push']);
  assert.deepEqual(wf.on.pull_request.types, [
    'opened',
    'synchronize',
    'reopened',
    'ready_for_review',
  ]);
  assert.deepEqual(wf.on.push.branches, ['main']);
  assert.deepEqual(wf.permissions, { contents: 'read' });
  assert.deepEqual(Object.keys(wf.jobs), ['server-mutation-report']);
  const job = wf.jobs['server-mutation-report'];
  assert.equal(job.if, "github.event_name == 'push' || github.event.pull_request.draft == false");
  assert.equal(job.permissions, undefined);
  assert.doesNotMatch(source, /secrets\./u);
  assert.doesNotMatch(source, /TURBO_/u);
  assert.doesNotMatch(source, /pull_request_target|workflow_run/u);
});

test('advisory workflow: checkout without credentials, the repository setup action, then the three steps', () => {
  const steps = stepsOf();
  assert.match(steps[0].uses, /^actions\/checkout@[0-9a-f]{40}$/u);
  assert.equal(steps[0].with['persist-credentials'], false);
  assert.equal(steps[1].uses, './.github/actions/setup');
  const [scan, upload, record] = steps.slice(2);
  assert.equal(steps.length, 5);
  assert.equal(scan.id, 'scan');
  assert.equal(scan['continue-on-error'], true);
  assert.equal(scan.if, undefined);
  assert.match(
    scan.run,
    /node scripts\/ci\/server-mutation-check\.mjs --base "\$\{BASE_SHA\}" --head "\$\{HEAD_SHA\}"/u
  );
  assert.match(scan.run, /echo "exit=\$\{code\}" >> "\$\{GITHUB_OUTPUT\}"/u);
  assert.equal(upload.id, 'upload');
  assert.equal(upload.if, 'always()');
  assert.equal(upload['continue-on-error'], true);
  assert.match(upload.uses, /^actions\/upload-artifact@[0-9a-f]{40}$/u);
  assert.equal(upload.with.path, 'tmp/server-mutation-check/report.json');
  assert.equal(upload.with['if-no-files-found'], 'error');
  assert.equal(record.if, 'always()');
  assert.equal(record['continue-on-error'], undefined);
  assert.equal(record.env.SCAN_EXIT, '${{ steps.scan.outputs.exit }}');
  assert.equal(record.env.UPLOAD_OUTCOME, '${{ steps.upload.outcome }}');
  assert.match(record.run, /replay needed/u);
  assert.match(record.run, /GITHUB_STEP_SUMMARY/u);
});

test('ci.yml neither runs the scanner nor is read by it', () => {
  assert.doesNotMatch(read('.github/workflows/ci.yml'), /server-mutation/u);
  const sources = [
    'scripts/ci/server-mutation-check.mjs',
    ...fs
      .readdirSync(path.join(REPO_ROOT, 'scripts/ci/server-mutation'))
      .map(name => `scripts/ci/server-mutation/${name}`),
  ];
  for (const file of sources) assert.doesNotMatch(read(file), /\.github\/workflows/u, file);
});
