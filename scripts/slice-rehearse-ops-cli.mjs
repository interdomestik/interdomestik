#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  canonicalJson,
  exactKeys,
  must,
  readBoundedRegularText,
  sha256,
} from './slice-rehearse-canonical.mjs';
import { executeCleanupRequest } from './slice-rehearse-cleanup.mjs';
import { readLiveOperationAuthority } from './slice-rehearse-operation-live.mjs';
import { runSafeOperation } from './slice-rehearse-ops.mjs';

const SAFE_GIT = Object.freeze({
  encoding: 'utf8',
  env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin' },
  maxBuffer: 1024 * 1024,
  timeout: 30_000,
});

function inspectCleanupPath(path) {
  const value = lstatSync(path, { bigint: true, throwIfNoEntry: false });
  must(value && !value.isSymbolicLink(), `cleanup target is unavailable or unsafe: ${path}`);
  const type = value.isDirectory() ? 'directory' : value.isFile() ? 'file' : null;
  must(type, `cleanup target type is unsupported: ${path}`);
  return {
    realPath: realpathSync(path),
    type,
    device: String(value.dev),
    inode: String(value.ino),
  };
}

function digestCleanupFile(path) {
  const descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    must(fstatSync(descriptor).isFile(), 'cleanup recovery bundle must remain a regular file');
    return sha256(readFileSync(descriptor));
  } finally {
    closeSync(descriptor);
  }
}

function readCleanupRegistry(taskId) {
  const gitDir = execFileSync('/usr/bin/git', ['rev-parse', '--absolute-git-dir'], SAFE_GIT).trim();
  const registryPath = resolve(gitDir, 'interdomestik-harness', 'cleanup', `${taskId}.json`);
  const registry = JSON.parse(
    readBoundedRegularText(registryPath, {
      label: 'Cleanup ownership registry',
      maxBytes: 256 * 1024,
      allowedRoots: [dirname(registryPath)],
    })
  );
  exactKeys(registry, ['artifacts', 'schemaVersion', 'taskId'], 'cleanup ownership registry');
  must(
    registry.schemaVersion === 1 && registry.taskId === taskId && Array.isArray(registry.artifacts),
    'cleanup ownership registry identity differs'
  );
  return registry.artifacts;
}

function readRequest(path, label) {
  return JSON.parse(
    readBoundedRegularText(resolve(process.cwd(), path), {
      label,
      maxBytes: 256 * 1024,
      allowedRoots: [process.cwd(), tmpdir(), '/private/tmp'],
    })
  );
}

export function runSafeOperationCli(argv = process.argv.slice(2)) {
  try {
    must(argv.length === 2 && argv[0] === '--request', 'usage: --request <path>');
    const request = readRequest(argv[1], 'Safe operation request');
    const result = runSafeOperation(request);
    process.stdout.write(canonicalJson(result));
    return result.status === 'succeeded' ? 0 : 1;
  } catch (error) {
    process.stderr.write(`safe operation failed: ${error.message}\n`);
    return 1;
  }
}

export function runCleanupCli(argv = process.argv.slice(2)) {
  try {
    must(
      argv.length === 3 && argv[0] === '--cleanup' && argv[1] === '--request',
      'usage: --cleanup --request <path>'
    );
    const result = executeCleanupRequest(readRequest(argv[2], 'Cleanup request'), {
      readAuthority: () => readLiveOperationAuthority('pre_cleanup'),
      readRegistry: readCleanupRegistry,
      inspect: inspectCleanupPath,
      digest: digestCleanupFile,
      remove: (path, type) => rmSync(path, { recursive: type === 'directory', force: false }),
    });
    process.stdout.write(canonicalJson(result));
    return 0;
  } catch (error) {
    process.stderr.write(`cleanup operation failed: ${error.message}\n`);
    return 1;
  }
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  process.exitCode = process.argv[2] === '--cleanup' ? runCleanupCli() : runSafeOperationCli();
}
