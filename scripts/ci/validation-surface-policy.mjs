#!/usr/bin/env node

import fs from 'node:fs';

import { evaluateValidationSurface } from './validation-surface-policy-lib.mjs';

function fail(message) {
  process.stderr.write(`validation-surface-policy failed: ${message}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const parsed = {
    eventName: '',
    changedFilesPath: '',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const nextValue = argv[index + 1];

    switch (argument) {
      case '--event-name':
        parsed.eventName = nextValue || '';
        index += 1;
        break;
      case '--changed-files-path':
        parsed.changedFilesPath = nextValue || '';
        index += 1;
        break;
      default:
        fail(`unknown argument: ${argument}`);
    }
  }

  if (!parsed.eventName) {
    fail('--event-name is required');
  }

  return parsed;
}

function readChangedFiles(changedFilesPath) {
  if (!changedFilesPath || !fs.existsSync(changedFilesPath)) {
    return [];
  }

  return fs
    .readFileSync(changedFilesPath, 'utf8')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
}

const { eventName, changedFilesPath } = parseArgs(process.argv.slice(2));
const result = evaluateValidationSurface({
  eventName,
  changedFiles: readChangedFiles(changedFilesPath),
});

process.stdout.write(`should_run=${String(result.shouldRun)}\n`);
process.stdout.write(`reason=${result.reason}\n`);
process.stdout.write(`non_product_only_paths=${JSON.stringify(result.nonProductOnlyPaths)}\n`);
