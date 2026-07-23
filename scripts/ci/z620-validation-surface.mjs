#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const baseRef = process.env.CI_LOCAL_BASE_REF || 'origin/main';
const changed = execFileSync('git', ['diff', '--name-only', `${baseRef}...HEAD`], {
  encoding: 'utf8',
});
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'z620-validation-'));
const changedPath = path.join(tempDir, 'changed-files.txt');

try {
  fs.writeFileSync(changedPath, changed);
  const output = execFileSync(
    'node',
    [
      'scripts/ci/validation-surface-policy.mjs',
      '--event-name',
      'pull_request',
      '--changed-files-path',
      changedPath,
    ],
    { encoding: 'utf8' }
  );
  process.stdout.write(output);
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
