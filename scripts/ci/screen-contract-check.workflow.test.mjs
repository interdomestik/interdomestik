import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import yaml from 'js-yaml';

import { byCodeUnit } from './server-mutation/ast.mjs';
import { REPO_ROOT } from './fixtures/screen-contract-check/harness.mjs';

const WORKFLOW = '.github/workflows/screen-contract-report.yml';
const read = relative => fs.readFileSync(path.join(REPO_ROOT, relative), 'utf8');
const workflow = () => yaml.load(read(WORKFLOW));
const stepsOf = () => workflow().jobs['screen-contract-report'].steps;

test('advisory workflow: non-draft pull requests and pushes to main, read-only, no secrets or remote cache', () => {
  const source = read(WORKFLOW);
  const wf = workflow();
  assert.deepEqual(Object.keys(wf.on).sort(byCodeUnit), ['pull_request', 'push']);
  assert.deepEqual(wf.on.pull_request.types, [
    'opened',
    'synchronize',
    'reopened',
    'ready_for_review',
  ]);
  assert.deepEqual(wf.on.push.branches, ['main']);
  assert.deepEqual(wf.permissions, { contents: 'read' });
  assert.deepEqual(Object.keys(wf.jobs), ['screen-contract-report']);
  const job = wf.jobs['screen-contract-report'];
  assert.equal(job.if, "github.event_name == 'push' || github.event.pull_request.draft == false");
  assert.equal(job.permissions, undefined);
  assert.doesNotMatch(source, /secrets\./u);
  assert.doesNotMatch(source, /TURBO_/u);
  assert.doesNotMatch(source, /pull_request_target|workflow_run/u);
});

// Code review r1 B1 (lead: option a): the scanner, its setup and its dependencies come from the
// trusted base; the head is data, fetched by sha and extracted by the scanner. A base without the
// scanner (the bootstrap PR) reports "no trusted scanner" and runs nothing from the head.
test('advisory workflow: trusted base checkout, head fetched as data, scanner only from the base', () => {
  const steps = stepsOf();
  const byId = Object.fromEntries(steps.filter(step => step.id).map(step => [step.id, step]));
  const [checkout] = steps;
  assert.match(checkout.uses, /^actions\/checkout@[0-9a-f]{40}$/u);
  assert.equal(checkout.with.ref, '${{ github.event.pull_request.base.sha || github.sha }}');
  assert.equal(checkout.with['persist-credentials'], false);
  assert.equal(checkout.with['fetch-depth'], 0);
  const source = read(WORKFLOW);
  assert.doesNotMatch(source, /ref: \$\{\{ github\.event\.pull_request\.head\.sha/u);

  const trusted = byId.trusted;
  assert.ok(trusted, 'a step decides whether the base has the scanner');
  assert.match(trusted.run, /scripts\/ci\/screen-contract-check\.mjs/u);
  assert.ok(
    steps.indexOf(trusted) < steps.findIndex(step => step.uses === './.github/actions/setup')
  );

  const setup = steps.find(step => step.uses === './.github/actions/setup');
  assert.equal(setup.if, "steps.trusted.outputs.present == 'true'");

  const fetch = byId.fetch;
  assert.ok(fetch, 'the head is fetched by sha');
  assert.match(fetch.run, /git fetch --no-tags origin "\$\{HEAD_SHA\}"/u);
  assert.doesNotMatch(fetch.run, /checkout|switch/u);

  const scan = byId.scan;
  assert.equal(scan.if, "steps.trusted.outputs.present == 'true'");
  assert.equal(scan['continue-on-error'], true);
  assert.match(
    scan.run,
    /node scripts\/ci\/screen-contract-check\.mjs --base "\$\{BASE_SHA\}" --head "\$\{HEAD_SHA\}"/u
  );
  assert.match(scan.run, /echo "exit=\$\{code\}" >> "\$\{GITHUB_OUTPUT\}"/u);

  const bootstrap = byId.bootstrap;
  assert.equal(bootstrap.if, "steps.trusted.outputs.present != 'true'");
  assert.match(bootstrap.run, /no trusted scanner/u);
  assert.match(bootstrap.run, /tmp\/screen-contract-check\/report\.json/u);

  const upload = byId.upload;
  assert.equal(upload.if, 'always()');
  assert.equal(upload['continue-on-error'], true);
  assert.match(upload.uses, /^actions\/upload-artifact@[0-9a-f]{40}$/u);
  assert.equal(upload.with.path, 'tmp/screen-contract-check/report.json');
  assert.equal(upload.with['if-no-files-found'], 'error');

  const record = steps.at(-1);
  assert.equal(record.if, 'always()');
  assert.equal(record['continue-on-error'], undefined);
  assert.equal(record.env.SCAN_EXIT, '${{ steps.scan.outputs.exit }}');
  assert.equal(record.env.UPLOAD_OUTCOME, '${{ steps.upload.outcome }}');
  assert.equal(record.env.TRUSTED, '${{ steps.trusted.outputs.present }}');
  assert.match(record.run, /replay needed/u);
  assert.match(record.run, /no trusted scanner/u);
  assert.match(record.run, /GITHUB_STEP_SUMMARY/u);
});

test('ci.yml neither runs the scanner nor is read by it', () => {
  assert.doesNotMatch(read('.github/workflows/ci.yml'), /screen-contract/u);
  const sources = [
    'scripts/ci/screen-contract-check.mjs',
    ...fs
      .readdirSync(path.join(REPO_ROOT, 'scripts/ci/screen-contract'))
      .map(name => `scripts/ci/screen-contract/${name}`),
  ];
  for (const file of sources) assert.doesNotMatch(read(file), /\.github\/workflows/u, file);
});
