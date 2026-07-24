import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { trustedHomeDirectory } from './managed-paths.mjs';
import {
  gateEnvironment,
  prepareCacheNamespace,
  prepareEvidenceSubdirectory,
  resolveEvidenceDirectory,
  resolveStateRoot,
} from './z620-resource-policy.mjs';

const root = path.resolve(import.meta.dirname, '../..');

test('managed paths reject symlinked ancestors below trusted anchors', t => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'z620-symlink-'));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  const homeDir = path.join(fixture, 'home');
  const outside = path.join(fixture, 'outside');
  fs.mkdirSync(homeDir);
  fs.mkdirSync(outside);
  fs.symlinkSync(outside, path.join(homeDir, 'ci'), 'dir');

  assert.throws(
    () =>
      resolveEvidenceDirectory(
        path.join(homeDir, 'ci/interdomestik/runs/review-r1'),
        root,
        homeDir
      ),
    /symbolic link/
  );
  assert.throws(() => resolveStateRoot(undefined, root, homeDir), /symbolic link/);

  const fakeRoot = path.join(fixture, 'repo');
  fs.mkdirSync(fakeRoot);
  fs.symlinkSync(outside, path.join(fakeRoot, 'tmp'), 'dir');
  assert.throws(() => resolveEvidenceDirectory(undefined, fakeRoot, homeDir), /symbolic link/);
});

test('gate and pilot use validated sinks, trusted home, and scrubbed selectors', t => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'z620-sink-'));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  const homeDir = path.join(fixture, 'home');
  const outside = path.join(fixture, 'outside');
  const runDir = path.join(homeDir, 'ci/interdomestik/runs/review-r1');
  fs.mkdirSync(runDir, { recursive: true });
  fs.mkdirSync(outside);

  for (const sink of ['logs', 'pilot-reports']) {
    fs.symlinkSync(outside, path.join(runDir, sink), 'dir');
    assert.throws(() => prepareEvidenceSubdirectory(runDir, sink, root, homeDir), /symbolic link/);
    fs.rmSync(path.join(runDir, sink));
  }

  const cacheRoot = path.join(homeDir, 'ci/interdomestik/cache/turbo');
  fs.mkdirSync(cacheRoot, { recursive: true });
  fs.symlinkSync(outside, path.join(cacheRoot, 'review-cache'), 'dir');
  assert.throws(
    () => prepareCacheNamespace(undefined, 'review-cache', root, homeDir),
    /symbolic link/
  );
  fs.rmSync(path.join(cacheRoot, 'review-cache'));

  const environment = gateEnvironment(
    {
      KEEP_ME: 'yes',
      Z620_EVIDENCE_DIR: '/tmp/stale',
      Z620_EVIDENCE_RUN_ID: 'stale-run',
    },
    null
  );
  assert.equal(environment.KEEP_ME, 'yes');
  assert.equal(environment.Z620_EVIDENCE_DIR, undefined);
  assert.equal(environment.Z620_EVIDENCE_RUN_ID, undefined);

  const priorHome = process.env.HOME;
  process.env.HOME = outside;
  t.after(() => {
    if (priorHome === undefined) delete process.env.HOME;
    else process.env.HOME = priorHome;
  });
  assert.notEqual(trustedHomeDirectory(), outside);

  const gate = fs.readFileSync(path.join(root, 'scripts/ci/z620-gate-run.mjs'), 'utf8');
  const pilot = fs.readFileSync(path.join(root, 'scripts/ci/z620-pilot-run.mjs'), 'utf8');
  const policy = fs.readFileSync(path.join(root, 'scripts/ci/z620-resource-policy.mjs'), 'utf8');
  assert.match(gate, /prepareEvidenceSubdirectory/);
  assert.match(gate, /gateEnvironment/);
  assert.match(pilot, /prepareEvidenceSubdirectory/);
  assert.doesNotMatch(`${policy}\n${pilot}`, /os\.homedir\(\)/);
});
