import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { envFilesOnDisk, localEnvFiles } from './verify-machine-env-files.mjs';

function tree(files) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'verify-machine-env-files-'));
  for (const file of files) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), 'X=1\n');
  }
  return root;
}

test('env files are found on disk in every directory, any case, inside nested checkouts', () => {
  const root = tree([
    '.env',
    '.ENV.LOCAL',
    '.envrc',
    '.env.example',
    'apps/web/.env.production.local',
    'tmp/café/.env',
    '.env.\nhidden',
    // A nested checkout is one opaque entry for git; its files are still on disk.
    'tmp/secondary/.git',
    'tmp/secondary/.env',
    'apps/web/.next/standalone/apps/web/.env',
    'notes/environment.md',
    'node_modules/pkg/.env',
    '.git/.env',
  ]);
  symlinkSync('/nonexistent', path.join(root, 'apps/.env.linked'));
  const tracked = ['.env.example', ''].join('\0');
  const exec = (command, args, cwd) => {
    assert.deepEqual(
      [command, ...args, cwd],
      ['git', 'ls-files', '-z', '--', ':(glob,icase)**/.env', ':(glob,icase)**/.env.*', root]
    );
    return tracked;
  };
  assert.deepEqual(localEnvFiles(root, exec), {
    files: [
      '.env',
      '.env.\nhidden',
      '.ENV.LOCAL',
      'apps/.env.linked',
      'apps/web/.env.production.local',
      'apps/web/.next/standalone/apps/web/.env',
      'tmp/café/.env',
      'tmp/secondary/.env',
    ],
    unsearched: [],
  });
  rmSync(root, { recursive: true });
});

test('a directory that cannot be read is reported, never skipped silently', () => {
  const root = tree(['tmp/locked/.env']);
  chmodSync(path.join(root, 'tmp/locked'), 0o000);
  try {
    const result = envFilesOnDisk(root);
    if (process.getuid?.() === 0) return; // root reads every directory
    assert.deepEqual(result, { files: [], unsearched: ['tmp/locked'] });
  } finally {
    chmodSync(path.join(root, 'tmp/locked'), 0o700);
    rmSync(root, { recursive: true });
  }
});
