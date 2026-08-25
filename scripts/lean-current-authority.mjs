#!/usr/bin/env node
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveRepositoryAuthority } from './lean-current-authority-evidence.mjs';

export {
  APPROVAL_PREFIX,
  approvalMarker,
  classifyWriterPath,
  compareCanonicalText,
  parseAuthorityDocuments,
} from './lean-current-authority-policy.mjs';
export {
  classifyCloseoutPull,
  isBootstrapAnchor,
  isCanonicalOrigin,
  isClosedUnmergedPull,
  selectFullProductPull,
} from './lean-current-authority-evidence.mjs';
export { verifyCloseout } from './lean-current-authority-closeout.mjs';
export { resolveAuthority } from './lean-current-authority-lifecycle.mjs';
export { resolveRepositoryAuthority };

function main() {
  const command = process.argv[2] ?? 'status';
  const repo = process.argv.find(argument => argument.startsWith('--repo='))?.slice(7);
  if (!['status', 'conformance'].includes(command)) {
    throw new Error(`unknown command: ${command}`);
  }
  const result = resolveRepositoryAuthority(repo ?? process.cwd(), command === 'status');
  const output =
    command === 'conformance' ? { ok: result.lifecycle !== 'blocked', ...result } : result;
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (result.lifecycle === 'blocked') process.exitCode = 1;
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`lean authority failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
