#!/usr/bin/env node

import fs from 'node:fs';

import { evaluateAiEvalSurface } from './ai-eval-surface-lib.mjs';

function fail(message) {
  process.stderr.write(`ai-eval-surface failed: ${message}\n`);
  process.exit(2);
}

function parseArgs(argv) {
  const args = [...argv];
  const parsed = {
    eventName: '',
    changedFilesPath: '',
  };

  while (args.length > 0) {
    const arg = args.shift();

    switch (arg) {
      case '--event-name':
        parsed.eventName = args.shift() ?? '';
        break;
      case '--changed-files-path':
        parsed.changedFilesPath = args.shift() ?? '';
        break;
      default:
        fail(`unknown argument: ${arg}`);
    }
  }

  return parsed;
}

const { eventName, changedFilesPath } = parseArgs(process.argv.slice(2));

if (!eventName) {
  fail('--event-name is required');
}

const changedFiles =
  changedFilesPath && fs.existsSync(changedFilesPath)
    ? fs.readFileSync(changedFilesPath, 'utf8').split(/\r?\n/)
    : [];

const result = evaluateAiEvalSurface({ eventName, changedFiles });

process.stdout.write(`should_run=${String(result.shouldRun)}\n`);
process.stdout.write(`reason=${result.reason}\n`);
process.stdout.write(`matched_paths=${JSON.stringify(result.matchedPaths)}\n`);
