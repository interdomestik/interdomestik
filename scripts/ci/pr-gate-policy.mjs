#!/usr/bin/env node

import { evaluatePrGatePolicy } from './pr-gate-policy-lib.mjs';
import { readTrustedRunnerFile } from './trusted-runner-file.mjs';

function valueFor(flag) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

function readJson(filePath) {
  if (!filePath) return {};
  try {
    return JSON.parse(readTrustedRunnerFile(filePath));
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return {};
    throw error;
  }
}

function readChangedFiles(filePath) {
  if (!filePath) return { files: [], exists: false };
  let changedFiles;
  try {
    changedFiles = readTrustedRunnerFile(filePath);
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      return { files: [], exists: false };
    }
    throw error;
  }
  const files = changedFiles
    .split('\n')
    .map(value => value.trim())
    .filter(Boolean);
  return { files, exists: true };
}

const event = readJson(valueFor('--event-path') || process.env.GITHUB_EVENT_PATH);
const eventName = valueFor('--event-name') || process.env.GITHUB_EVENT_NAME || 'unknown';
const changed = readChangedFiles(valueFor('--changed-files-path'));
const expectedChangedFiles = event.pull_request?.changed_files;
const actualChangedFilesText = process.env.PR_GATE_CHANGED_FILE_COUNT?.trim() || '';
const actualChangedFiles = /^\d+$/u.test(actualChangedFilesText)
  ? Number(actualChangedFilesText)
  : Number.NaN;
const changedFilesComplete =
  eventName !== 'pull_request' ||
  (changed.exists &&
    Number.isInteger(expectedChangedFiles) &&
    Number.isInteger(actualChangedFiles) &&
    actualChangedFiles >= expectedChangedFiles);
const labels = (event.pull_request?.labels || []).map(label => label.name).filter(Boolean);

const decision = evaluatePrGatePolicy({
  eventName,
  action: event.action,
  draft: event.pull_request?.draft,
  labels,
  changedFiles: changed.files,
  changedFilesComplete,
});

process.stdout.write(`run_full=${decision.runFull}\n`);
process.stdout.write(`force_full=${decision.forceFull}\n`);
process.stdout.write(`reason=${decision.reason}\n`);
process.stdout.write(`high_risk_paths=${JSON.stringify(decision.highRiskPaths)}\n`);
