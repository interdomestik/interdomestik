import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { evaluateModularityGuard } from './lib/modularity-guard.mjs';
import { MODULARITY_LINE_LIMIT } from './modularity-guard-policy.mjs';

function parseArgs(argv) {
  const options = {};
  for (const arg of argv) {
    if (arg.startsWith('--root=')) options.root = arg.slice('--root='.length);
    else if (arg.startsWith('--base=')) options.baseRef = arg.slice('--base='.length);
    else if (arg === '--help' || arg === '-h') {
      console.log('Usage: node scripts/check-modularity-guard.mjs [--root=<repo>] [--base=<ref>]');
      process.exit(0);
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

export function runModularityGuard(options = {}) {
  const result = evaluateModularityGuard(options);
  if (result.status === 'skipped') {
    console.warn(result.warning);
    return 0;
  }

  if (result.violations.length === 0) {
    console.log(
      `Modularity guard passed: ${result.checkedFiles} changed text file(s) checked against ${result.base.ref}.`
    );
    return 0;
  }

  console.error(
    `Modularity guard failed: files must stay at or below ${MODULARITY_LINE_LIMIT} lines.`
  );
  for (const violation of result.violations) {
    const base = violation.baseLines == null ? 'new' : `${violation.baseLines} base`;
    console.error(
      `- ${violation.file}: ${violation.currentLines} lines (${base}; ${violation.reason})`
    );
  }
  return 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = runModularityGuard(parseArgs(process.argv.slice(2)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
