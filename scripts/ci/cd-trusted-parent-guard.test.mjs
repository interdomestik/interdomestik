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
const classifierTemplate = workflow.jobs.scope.steps.find(
  step => step.name === 'Classify deployment scope'
).run;
const git = (directory, ...args) =>
  execFileSync('/usr/bin/git', args, { cwd: directory, encoding: 'utf8' }).trim();

function commit(directory, pathspec, message) {
  git(directory, 'add', pathspec);
  git(directory, 'commit', '-m', message);
  return git(directory, 'rev-parse', 'HEAD');
}

function writeFixtureFile(directory, relativePath, contents) {
  const target = path.join(directory, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents);
}

function writeFixtureGuard(directory, marker) {
  fs.mkdirSync(path.join(directory, 'scripts/ci'), { recursive: true });
  fs.writeFileSync(
    path.join(directory, 'scripts/ci/cd-nondeploy-guard.mjs'),
    `process.stdout.write('selected=${marker}\\n');\n`
  );
}

function bindFixtureBootstrap(fixtureBootstrap) {
  const segments = classifierTemplate.split(bootstrapParent);
  assert.equal(segments.length, 2, 'production bootstrap SHA must occur exactly once');
  return segments.join(fixtureBootstrap);
}

function runClassifier(directory, command, before, event = {}) {
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
  execFileSync('/bin/bash', ['-c', command], { cwd: directory, env });
  return fs.readFileSync(output, 'utf8');
}

test('classifier executes trusted parent code and limits current code to exact bootstrap or deploy-always events', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-parent-guard-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  git(directory, 'init');
  git(directory, 'config', 'user.name', 'CI Test');
  git(directory, 'config', 'user.email', 'ci@example.test');

  writeFixtureFile(directory, 'wrong-parent.txt', 'wrong parent\n');
  const wrongBootstrap = commit(directory, 'wrong-parent.txt', 'wrong parent');
  writeFixtureFile(directory, 'fixture-bootstrap.txt', 'fixture bootstrap\n');
  const fixtureBootstrap = commit(directory, 'fixture-bootstrap.txt', 'fixture bootstrap');
  const classifierRun = bindFixtureBootstrap(fixtureBootstrap);

  writeFixtureGuard(directory, 'bootstrap-current');
  assert.equal(
    runClassifier(directory, classifierRun, fixtureBootstrap),
    'selected=bootstrap-current\n'
  );
  assert.throws(() => runClassifier(directory, classifierRun, wrongBootstrap));
  assert.equal(fs.readFileSync(path.join(directory, 'scope-output.txt'), 'utf8'), '');

  writeFixtureGuard(directory, 'trusted-parent');
  const trustedBefore = commit(
    directory,
    'scripts/ci/cd-nondeploy-guard.mjs',
    'trusted parent guard'
  );
  writeFixtureGuard(directory, 'untrusted-current');
  assert.equal(runClassifier(directory, classifierRun, trustedBefore), 'selected=trusted-parent\n');
  fs.rmSync(path.join(directory, 'tmp'), { recursive: true, force: true });

  const trustedTarget = path.join(directory, 'tmp/cd-evidence/trusted-parent-guard.mjs');
  for (const prepare of [
    target => fs.writeFileSync(target, 'occupied\n'),
    target => fs.symlinkSync(path.join(directory, 'scripts/ci/cd-nondeploy-guard.mjs'), target),
  ]) {
    fs.mkdirSync(path.dirname(trustedTarget), { recursive: true });
    prepare(trustedTarget);
    assert.throws(() => runClassifier(directory, classifierRun, trustedBefore));
    assert.equal(fs.readFileSync(path.join(directory, 'scope-output.txt'), 'utf8'), '');
    fs.rmSync(path.join(directory, 'tmp'), { recursive: true, force: true });
  }

  for (const event of [
    { GITHUB_EVENT_NAME: 'workflow_dispatch' },
    { GITHUB_EVENT_NAME: 'push', GITHUB_REF: 'refs/tags/v3.2.1' },
  ]) {
    assert.equal(
      runClassifier(directory, classifierRun, trustedBefore, event),
      'selected=untrusted-current\n'
    );
  }
});
