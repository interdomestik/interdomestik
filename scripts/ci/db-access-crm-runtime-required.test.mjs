import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { crmCandidateRecords } from './db-access-crm-runtime-required.mjs';
import { hash, snapshot } from './db-access-provider-runtime-identity.mjs';

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

test('consumed CRM patch is bookended even when absent from finite source list', t => {
  const f = fixture(t);
  const records = crmCandidateRecords(f.policy, f.root);
  const { file, ...expected } = f.patch;
  assert.deepEqual(records, { [file]: expected });
});

test('expected checkout patch cannot substitute for a missing candidate Git blob', t => {
  const f = fixture(t);
  const records = crmCandidateRecords(f.policy, f.root);
  assert.throws(() => snapshot(f.root, 'candidate', records, () => ''), /checkout\/tree mismatch/u);
});

test('expected checkout patch cannot substitute for different candidate Git bytes', t => {
  const f = fixture(t);
  const records = crmCandidateRecords(f.policy, f.root);
  const git = () => `100644 blob ${'a'.repeat(40)}\t${f.patchFile}`;
  git.readBlob = () => Buffer.from('different Git patch');
  assert.throws(() => snapshot(f.root, 'candidate', records, git), /checkout\/tree mismatch/u);
});

test('modified package shard refuses before patch identities are derived', t => {
  const f = fixture(t);
  fs.appendFileSync(path.join(f.root, 'scripts/ci/db-access-crm-runtime-packages-1.json'), ' ');
  assert.throws(() => crmCandidateRecords(f.policy, f.root), /input identity/u);
});
