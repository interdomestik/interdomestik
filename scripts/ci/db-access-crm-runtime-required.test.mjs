import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { crmCandidateRecords } from './db-access-crm-runtime-required.mjs';
import {
  authenticateRuntimeContext,
  hash,
  safeEnv,
  snapshot,
} from './db-access-provider-runtime-identity.mjs';

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'crm-patch-binding-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (file, text) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), text);
    return { sha256: hash(text), bytes: Buffer.byteLength(text), mode: '100644' };
  };
  const patchFile = 'patches/next@16.3.8.patch';
  const patch = { file: patchFile, ...write(patchFile, 'exact patch bytes\n') };
  const packageFiles = {};
  for (let i = 1; i <= 3; i++) {
    const file = `scripts/ci/db-access-crm-runtime-packages-${i}.json`;
    packageFiles[file] = write(file, JSON.stringify(i === 1 ? { next: { patch } } : {}));
  }
  const file = 'scripts/ci/db-access-crm-runtime-lock.json';
  const policy = {
    crmProof: {},
    producerFiles: { [file]: write(file, JSON.stringify({ packageFiles })) },
  };
  return { root, policy, patchFile, patch };
}

function authenticatedPatch(f, variant) {
  const run = (...args) =>
    execFileSync('/usr/bin/git', ['-c', 'core.hooksPath=/dev/null', '-C', f.root, ...args], {
      env: safeEnv,
    });
  const full = path.join(f.root, f.patchFile);
  const checkout = fs.readFileSync(full);
  run('init', '--initial-branch=main');
  fs.writeFileSync(path.join(f.root, 'marker'), 'fixture\n');
  run('add', 'marker');
  if (variant !== 'missing') {
    if (variant === 'different') fs.writeFileSync(full, 'different Git patch\n');
    run('add', '--', f.patchFile);
  }
  run(
    '-c',
    'user.name=CRM snapshot fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '--no-gpg-sign',
    '-m',
    'fixture'
  );
  fs.writeFileSync(full, checkout);
  const commit = run('rev-parse', 'HEAD').toString().trim();
  const tree = run('rev-parse', 'HEAD^{tree}').toString().trim();
  run('update-ref', 'refs/protected/main', commit);
  const git = authenticateRuntimeContext(path.join(f.root, '.git'), {
    version: 1,
    repository: 'interdomestik/interdomestik',
    eventName: 'push',
    baseCommit: commit,
    headCommit: commit,
    candidateCommit: commit,
    candidateTree: tree,
    sourceCommit: commit,
    sourceTree: tree,
    protectedMain: commit,
  });
  return { commit, git };
}

test('consumed CRM patch is bookended even when absent from finite source list', t => {
  const f = fixture(t);
  const records = crmCandidateRecords(f.policy, f.root);
  const { file, ...expected } = f.patch;
  assert.deepEqual(records, { [file]: expected });
});

test('expected checkout patch cannot substitute for a missing candidate Git blob', t => {
  const f = fixture(t);
  const records = crmCandidateRecords(f.policy, f.root);
  const { commit, git } = authenticatedPatch(f, 'missing');
  assert.throws(() => snapshot(f.root, commit, records, git), /checkout\/tree mismatch/u);
});

test('expected checkout patch cannot substitute for different candidate Git bytes', t => {
  const f = fixture(t);
  const records = crmCandidateRecords(f.policy, f.root);
  const { commit, git } = authenticatedPatch(f, 'different');
  assert.throws(() => snapshot(f.root, commit, records, git), /checkout\/tree mismatch/u);
});

test('matching authenticated Git patch passes the same CRM snapshot boundary', t => {
  const f = fixture(t);
  const records = crmCandidateRecords(f.policy, f.root);
  const { commit, git } = authenticatedPatch(f, 'same');
  assert.equal(
    snapshot(f.root, commit, records, git),
    hash(JSON.stringify({ [f.patchFile]: f.patch.sha256 }))
  );
});

test('modified package shard refuses before patch identities are derived', t => {
  const f = fixture(t);
  fs.appendFileSync(path.join(f.root, 'scripts/ci/db-access-crm-runtime-packages-1.json'), ' ');
  assert.throws(() => crmCandidateRecords(f.policy, f.root), /input identity/u);
});
