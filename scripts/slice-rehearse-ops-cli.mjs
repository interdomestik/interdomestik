#!/usr/bin/env node
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalJson, must, readBoundedRegularText } from './slice-rehearse-canonical.mjs';
import { runSafeOperation } from './slice-rehearse-ops.mjs';

export function runSafeOperationCli(argv = process.argv.slice(2)) {
  try {
    must(argv.length === 2 && argv[0] === '--request', 'usage: --request <path>');
    const request = JSON.parse(
      readBoundedRegularText(resolve(process.cwd(), argv[1]), {
        label: 'Safe operation request',
        maxBytes: 128 * 1024,
        allowedRoots: [process.cwd(), tmpdir(), '/private/tmp'],
      })
    );
    const result = runSafeOperation(request);
    process.stdout.write(canonicalJson(result));
    return result.status === 'succeeded' ? 0 : 1;
  } catch (error) {
    process.stderr.write(`safe operation failed: ${error.message}\n`);
    return 1;
  }
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  process.exitCode = runSafeOperationCli();
}
