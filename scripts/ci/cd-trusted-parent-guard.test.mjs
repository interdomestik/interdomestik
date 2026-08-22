import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import yaml from 'js-yaml';

const repositoryRoot = path.resolve(new URL('../../', import.meta.url).pathname);
const bootstrapParent = 'ba9da7ff8b13ceb1f1bc64864a40045ce4a79051';
const workflow = yaml.load(
  fs.readFileSync(path.join(repositoryRoot, '.github/workflows/cd.yml'), 'utf8')
);
const classifierRun = workflow.jobs.scope.steps.find(
  step => step.name === 'Classify deployment scope'
).run;
const git = (directory, ...args) =>
  execFileSync('/usr/bin/git', args, { cwd: directory, encoding: 'utf8' }).trim();

function commit(directory, message) {
  git(directory, 'add', 'scripts/ci/cd-nondeploy-guard.mjs');
  git(directory, 'commit', '-m', message);
  return git(directory, 'rev-parse', 'HEAD');
}

function writeFixtureGuard(directory, marker) {
  fs.writeFileSync(
    path.join(directory, 'scripts/ci/cd-nondeploy-guard.mjs'),
    `process.stdout.write('selected=${marker}\\n');\n`
  );
}

function runClassifier(directory, before, event = {}) {
  const output = path.join(directory, 'scope-output.txt');
  fs.writeFileSync(output, '');
  const env = {
    ...process.env,
    CD_BEFORE: before,
    GITHUB_EVENT_NAME: 'push',
    GITHUB_OUTPUT: output,
    GITHUB_REF: 'refs/heads/main',
    ...event,
  };
  execFileSync('/bin/bash', ['-c', classifierRun], { cwd: directory, env });
  return fs.readFileSync(output, 'utf8');
}

test('classifier executes trusted parent code and limits current code to exact bootstrap or deploy-always events', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-parent-guard-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  git(directory, 'clone', '--shared', repositoryRoot, '.');
  git(directory, 'config', 'user.name', 'CI Test');
  git(directory, 'config', 'user.email', 'ci@example.test');

  writeFixtureGuard(directory, 'bootstrap-current');
  assert.equal(runClassifier(directory, bootstrapParent), 'selected=bootstrap-current\n');
  const wrongBootstrap = git(directory, 'rev-parse', `${bootstrapParent}^`);
  assert.throws(() => runClassifier(directory, wrongBootstrap));
  assert.equal(fs.readFileSync(path.join(directory, 'scope-output.txt'), 'utf8'), '');

  writeFixtureGuard(directory, 'trusted-parent');
  const trustedBefore = commit(directory, 'trusted parent guard');
  writeFixtureGuard(directory, 'untrusted-current');
  assert.equal(runClassifier(directory, trustedBefore), 'selected=trusted-parent\n');
  fs.rmSync(path.join(directory, 'tmp'), { recursive: true, force: true });

  const trustedTarget = path.join(directory, 'tmp/cd-evidence/trusted-parent-guard.mjs');
  for (const prepare of [
    target => fs.writeFileSync(target, 'occupied\n'),
    target => fs.symlinkSync(path.join(directory, 'scripts/ci/cd-nondeploy-guard.mjs'), target),
  ]) {
    fs.mkdirSync(path.dirname(trustedTarget), { recursive: true });
    prepare(trustedTarget);
    assert.throws(() => runClassifier(directory, trustedBefore));
    assert.equal(fs.readFileSync(path.join(directory, 'scope-output.txt'), 'utf8'), '');
    fs.rmSync(path.join(directory, 'tmp'), { recursive: true, force: true });
  }

  for (const event of [
    { GITHUB_EVENT_NAME: 'workflow_dispatch' },
    { GITHUB_EVENT_NAME: 'push', GITHUB_REF: 'refs/tags/v3.2.1' },
  ]) {
    assert.equal(runClassifier(directory, trustedBefore, event), 'selected=untrusted-current\n');
  }
});
