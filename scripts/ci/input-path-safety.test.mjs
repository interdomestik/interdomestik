import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { resolveReadableInputPath, resolveRepoPath } from '../input-path-safety.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('repo path resolution rejects symlinks that escape the repository', () => {
  const repoTmp = path.join(repoRoot, 'tmp');
  fs.mkdirSync(repoTmp, { recursive: true });
  const testDir = fs.mkdtempSync(path.join(repoTmp, 'input-path-safety-'));
  const externalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'input-path-safety-'));
  const externalFile = path.join(externalDir, 'outside.txt');
  const linkPath = path.join(testDir, 'outside-link.txt');

  try {
    fs.writeFileSync(externalFile, 'outside\n');
    fs.symlinkSync(externalFile, linkPath);

    assert.throws(
      () => resolveRepoPath(path.relative(repoRoot, linkPath), undefined, 'Tracker path'),
      /must stay inside the repository/u
    );
  } finally {
    fs.rmSync(testDir, { recursive: true, force: true });
    fs.rmSync(externalDir, { recursive: true, force: true });
  }
});

test('readable input paths allow temp files only when explicitly permitted', () => {
  const tempFile = path.join(os.tmpdir(), `input-path-safety-${process.pid}.json`);
  fs.writeFileSync(tempFile, '{}\n');

  try {
    assert.equal(resolveReadableInputPath(tempFile, 'Audit JSON file'), fs.realpathSync(tempFile));
    assert.throws(
      () => resolveReadableInputPath(tempFile, 'Audit allowlist file', { allowTemp: false }),
      /allowed input directory/u
    );
  } finally {
    fs.rmSync(tempFile, { force: true });
  }
});
