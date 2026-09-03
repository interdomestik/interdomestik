#!/usr/bin/env node
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalJson, must, readBoundedRegularText } from './slice-rehearse-canonical.mjs';
import { runSafeOperation } from './slice-rehearse-ops.mjs';

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

export function runCleanupCli() {
  process.stderr.write(
    'cleanup operation failed: cleanup_hold: crash-safe consumption is unproven\n'
  );
  return 1;
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  process.exitCode = process.argv[2] === '--cleanup' ? runCleanupCli() : runSafeOperationCli();
}
