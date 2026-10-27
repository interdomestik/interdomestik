import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import yaml from 'js-yaml';
import ts from 'typescript';
import { structuredArtifactOwner } from '../modularity-guard-policy.mjs';

const root = new URL('../../', import.meta.url);
const read = file => readFileSync(new URL(file, root), 'utf8');
const workflow = yaml.load(read('.github/workflows/ci.yml'));
const file = '.github/actions/ordinary-pr-coverage/action.yml';
const action = yaml.load(read(file));

test('ordinary partition follows release tests in the existing unit job', () => {
  const unit = workflow.jobs.unit;
  assert.equal(unit.if, "needs.validation-surface.outputs.run_broad == 'true'");
  assert.deepEqual(unit.permissions, {
    actions: 'read',
    contents: 'read',
    'pull-requests': 'read',
  });
  assert.deepEqual(unit.steps.at(-1), {
    name: 'Release Gate Unit Tests',
    uses: './.github/actions/ordinary-pr-coverage',
  });
  assert.equal(action.runs.using, 'composite');
  assert.equal(action.runs.steps.length, 3);
  assert.deepEqual(action.runs.steps[0], {
    name: 'Release Gate Unit Tests',
    shell: 'bash',
    run: 'pnpm test:release-gate',
  });
});

test('only current PR merges produce mandatory ordinary artifacts', () => {
  const [, producer, upload] = action.runs.steps;
  assert.equal(producer.if, "github.event_name == 'pull_request'");
  assert.equal(producer.shell, 'bash');
  assert.equal(producer.run, 'node scripts/ci/p2/ordinary-job.mjs');
  assert.equal(producer['continue-on-error'], undefined);
  assert.equal(upload.if, producer.if);
  assert.equal(upload['continue-on-error'], undefined);
  assert.equal(upload.uses, 'actions/upload-artifact@b7c566a772e6b6bfb58ed0dc250532a479d7789f');
  assert.deepEqual(upload.with, {
    name: 'ordinary-coverage-${{ github.run_attempt }}-${{ github.sha }}',
    path: 'tmp/p2-ordinary-artifact/',
    'if-no-files-found': 'error',
    'retention-days': 7,
  });
});

test('both dispatch files are pinned and composite ownership is exact', () => {
  const policy = JSON.parse(read('scripts/ci/p2/policy.json'));
  for (const path of ['.github/workflows/ci.yml', file])
    assert.equal(policy.dispatchFiles[path], createHash('sha256').update(read(path)).digest('hex'));
  assert.equal(structuredArtifactOwner(file), 'm4-ordinary-pr-coverage-contract');
  assert.equal(structuredArtifactOwner('.github/actions/foreign-coverage/action.yml'), null);
});

test('private M4 consumer admits exactly the pinned dispatch membership', () => {
  const unit = ts.createSourceFile(
    'ordinary.mjs',
    read('scripts/ci/db-access-m4-p2-ordinary.mjs'),
    ts.ScriptTarget.Latest,
    true
  );
  const members = [];
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(unit) === 'dispatchNames') {
      assert(ts.isArrayLiteralExpression(node.initializer));
      members.push(
        node.initializer.elements.map(element => {
          assert(ts.isStringLiteral(element));
          return element.text;
        })
      );
    }
    ts.forEachChild(node, visit);
  }
  visit(unit);
  assert.equal(members.length, 1);
  assert.deepEqual(
    members[0].sort(),
    Object.keys(JSON.parse(read('scripts/ci/p2/policy.json')).dispatchFiles).sort()
  );
});
