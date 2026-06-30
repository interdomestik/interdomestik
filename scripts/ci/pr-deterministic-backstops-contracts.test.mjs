import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import yaml from 'js-yaml';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '../..');

function readWorkflow(relativePath) {
  return yaml.load(fs.readFileSync(path.join(rootDir, relativePath), 'utf8'));
}

test('PR deterministic backstops run free scanner gates without AI review dependencies', () => {
  const workflow = readWorkflow('.github/workflows/pr-deterministic-backstops.yml');

  assert.deepEqual(workflow.on.pull_request.branches, ['**']);
  assert.equal(workflow.permissions.contents, 'read');

  const dependencyReview = workflow.jobs['dependency-review'];
  assert.equal(dependencyReview.permissions['pull-requests'], 'read');
  assert.equal(
    dependencyReview.steps.find(step => step?.name === 'Dependency Review').uses,
    'actions/dependency-review-action@v5.0.0'
  );
  assert.equal(
    dependencyReview.steps.find(step => step?.name === 'Dependency Review').with['fail-on-severity'],
    'high'
  );

  const osv = workflow.jobs['osv-scanner'];
  assert.match(
    osv.uses,
    /^google\/osv-scanner-action\/\.github\/workflows\/osv-scanner-reusable-pr\.yml@[a-f0-9]{40}$/u
  );
  assert.equal(osv.with['fail-on-vuln'], true);
  assert.match(osv.with['scan-args'], /--recursive/u);

  const semgrep = workflow.jobs['semgrep-ce'];
  const semgrepRun = semgrep.steps.find(step => step?.name === 'Run Semgrep against new PR findings');
  assert.equal(semgrep.permissions['security-events'], 'write');
  assert.match(semgrepRun.run, /--baseline-commit "\$\{BASE_SHA\}"/u);
  assert.match(semgrepRun.run, /--config p\/ci/u);
  assert.match(semgrepRun.run, /--sarif/u);
  assert.equal(
    semgrep.steps.find(step => step?.name === 'Upload Semgrep SARIF').uses,
    'github/codeql-action/upload-sarif@v4'
  );

  const reviewdog = workflow.jobs['reviewdog-eslint'];
  const annotate = reviewdog.steps.find(step => step?.name === 'Annotate web ESLint findings');
  assert.equal(reviewdog.permissions.checks, 'write');
  assert.equal(
    reviewdog.steps.some(step => /^reviewdog\/action-setup@[a-f0-9]{40}$/u.test(step?.uses ?? '')),
    true
  );
  assert.match(annotate.run, /-reporter=github-pr-check/u);
  assert.match(annotate.run, /-filter-mode=added/u);
  assert.match(annotate.run, /-fail-level=none/u);
});
