#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Z620_EXECUTABLES } from './managed-executables.mjs';

const candidates = [
  process.env.CI_LOCAL_BASE_SHA,
  process.env.CI_LOCAL_BASE_REF,
  'origin/main',
].filter(Boolean);
const baseRef = candidates.find(candidate => {
  const result = spawnSync(Z620_EXECUTABLES.git, ['rev-parse', '--verify', candidate], {
    stdio: 'ignore',
  });
  return result.status === 0;
});
if (!baseRef) throw new Error('No verified CI base SHA/ref; validation fails closed');
const changed = execFileSync(Z620_EXECUTABLES.git, ['diff', '--name-only', `${baseRef}...HEAD`], {
  encoding: 'utf8',
});
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'z620-validation-'));
const changedPath = path.join(tempDir, 'changed-files.txt');

try {
  fs.writeFileSync(changedPath, changed);
  const output = execFileSync(
    Z620_EXECUTABLES.node,
    [
      'scripts/ci/validation-surface-policy.mjs',
      '--event-name',
      'pull_request',
      '--changed-files-path',
      changedPath,
    ],
    {
      encoding: 'utf8',
      env: { ...process.env, RUNNER_TEMP: tempDir },
    }
  );
  process.stdout.write(output);
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
