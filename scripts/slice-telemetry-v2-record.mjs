#!/usr/bin/env node
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  lstatSync,
  openSync,
  realpathSync,
  writeSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalize, must, readBoundedRegularText } from './slice-rehearse-canonical.mjs';
import { trustedRunnerFile } from './ci/trusted-runner-file.mjs';
import { validateTelemetryEventV2 } from './slice-telemetry-v2-schema.mjs';

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
      .map(line => `${JSON.stringify(canonicalize(JSON.parse(line)))}\n`);
    must(!records.includes(record), 'duplicate telemetry event is forbidden');
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
  trustedRoots = [process.cwd(), tmpdir(), '/private/tmp'],
}) {
  const roots = trustedRoots.map(root => resolve(root));
  const allowedRoots = [...new Set([...roots, ...roots.map(root => realpathSync(root))])];
  const trustedRoot = [...roots]
    .sort((left, right) => right.length - left.length)
    .find(root => ledgerPath.startsWith(`${root}${sep}`));
  must(trustedRoot, 'telemetry ledger must stay inside a trusted root');
  const trustedLedgerPath = trustedRunnerFile(ledgerPath, { runnerTemp: trustedRoot });
  const event = JSON.parse(
    readBoundedRegularText(eventPath, {
      label: 'Telemetry event input',
      maxBytes: 128 * 1024,
      allowedRoots,
    })
  );
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
