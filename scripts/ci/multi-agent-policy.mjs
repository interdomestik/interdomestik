#!/usr/bin/env node

import fs from 'node:fs';

import { evaluateMultiAgentPolicy } from './multi-agent-policy-lib.mjs';

function fail(message) {
  process.stderr.write(`multi-agent-policy failed: ${message}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const parsed = {
    eventName: '',
    eventPath: '',
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
      case '--event-path':
        parsed.eventPath = nextValue || '';
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

function readLabels(eventPath) {
  if (!eventPath) {
    return [];
  }

  const event = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
  return (event.pull_request?.labels || []).map(label => label?.name || '');
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

const { eventName, eventPath, changedFilesPath } = parseArgs(process.argv.slice(2));
const result = evaluateMultiAgentPolicy({
  eventName,
  labels: readLabels(eventPath),
  changedFiles: readChangedFiles(changedFilesPath),
});

process.stdout.write(`should_run=${String(result.shouldRun)}\n`);
process.stdout.write(`reason=${result.reason}\n`);
process.stdout.write(`matched_paths=${JSON.stringify(result.matchedPaths)}\n`);
