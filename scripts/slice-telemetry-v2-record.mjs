#!/usr/bin/env node
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  lstatSync,
  openSync,
  realpathSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalize, must, readBoundedRegularText } from './slice-rehearse-canonical.mjs';
import { trustedRunnerFile } from './ci/trusted-runner-file.mjs';
import { validateTelemetryEventV2 } from './slice-telemetry-v2-schema.mjs';
import { summarizeTelemetryV2 } from './slice-telemetry-v2-aggregation.mjs';
import { HOST_BOUND_AUTHORITY_ROOT } from './slice-rehearse-ops.mjs';

const CHECKPOINT_ROOT = resolve(HOST_BOUND_AUTHORITY_ROOT, 'harness-telemetry');
export function checkpointTelemetryPath({ sliceId, baseSha }) {
  return resolve(CHECKPOINT_ROOT, `${sliceId}-${baseSha}.jsonl`);
}
export function readCheckpointTelemetry(input) {
  const ledgerPath = checkpointTelemetryPath(input);
  if (!existsSync(ledgerPath)) return null;
  const text = readBoundedRegularText(ledgerPath, {
    label: 'Checkpoint telemetry ledger',
    maxBytes: 16 * 1024 * 1024,
    allowedRoots: [CHECKPOINT_ROOT],
  });
  must(text.endsWith('\n') && !text.includes('\n\n'), 'telemetry v2 JSONL framing is invalid');
  const events = text
    .trimEnd()
    .split('\n')
    .map(line => JSON.parse(line));
  const summary = summarizeTelemetryV2(events);
  must(
    summary.sliceCount === 1 && summary.slices[0].sliceId === input.sliceId,
    'telemetry slice differs'
  );
  return summary.slices[0];
}

export function recordTelemetryEvent({ event, existingText }) {
  const normalized = validateTelemetryEventV2(event);
  const record = `${JSON.stringify(canonicalize(normalized))}\n`;
  must(typeof existingText === 'string', 'telemetry ledger is unavailable');
  if (existingText) {
    must(
      existingText.endsWith('\n') && !existingText.includes('\n\n'),
      'telemetry JSONL framing is invalid'
    );
    const records = existingText
      .trimEnd()
      .split('\n')
      .map(line => validateTelemetryEventV2(JSON.parse(line)));
    must(
      !records.some(item => item.eventId === normalized.eventId),
      'telemetry event ID must be unique'
    );
    if (normalized.runId !== null) {
      must(
        !records.some(item => item.runId === normalized.runId),
        'telemetry run ID must be unique'
      );
    }
  }
  return record;
}

function parseArgs(argv) {
  must(
    argv.length === 4 && argv[0] === '--event' && argv[2] === '--ledger',
    'usage: --event <path> --ledger <path>'
  );
  return { eventPath: resolve(argv[1]), ledgerPath: resolve(argv[3]) };
}

export function appendEvent({
  eventPath,
  ledgerPath,
  trustedRoots = [process.cwd(), tmpdir(), HOST_BOUND_AUTHORITY_ROOT],
}) {
  const roots = trustedRoots.map(root => resolve(root)).filter(existsSync);
  const allowedRoots = roots.flatMap(root => [root, realpathSync(root)]);
  const trustedRoot = [...roots]
    .sort((left, right) => right.length - left.length)
    .find(root => ledgerPath.startsWith(`${root}${sep}`));
  must(trustedRoot, 'telemetry ledger must stay inside trusted root');
  const trustedLedgerPath = trustedRunnerFile(ledgerPath, { runnerTemp: trustedRoot });
  const event = JSON.parse(
    readBoundedRegularText(eventPath, {
      label: 'Telemetry event input',
      maxBytes: 128 * 1024,
      allowedRoots,
    })
  );
  const lockPath = `${trustedLedgerPath}.lock`;
  const lock = openSync(
    lockPath,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    0o600
  );
  try {
    let existingText = '';
    if (existsSync(trustedLedgerPath)) {
      const ledgerStat = lstatSync(trustedLedgerPath);
      must(ledgerStat.isFile() && !ledgerStat.isSymbolicLink(), 'telemetry ledger is unsafe');
      existingText = readBoundedRegularText(trustedLedgerPath, {
        label: 'Telemetry ledger',
        maxBytes: 16 * 1024 * 1024,
        allowedRoots,
      });
    }
    const descriptor = openSync(
      trustedLedgerPath,
      constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW,
      0o600
    );
    try {
      must(fstatSync(descriptor).isFile(), 'telemetry ledger must remain a regular file');
      writeSync(descriptor, recordTelemetryEvent({ event, existingText }), null, 'utf8');
    } finally {
      closeSync(descriptor);
    }
  } finally {
    closeSync(lock);
    unlinkSync(lockPath);
  }
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  try {
    appendEvent(parseArgs(process.argv.slice(2)));
    process.stdout.write('{"status":"recorded"}\n');
  } catch (error) {
    process.stderr.write(`telemetry record failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
