#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { validateConformanceRecord } from './gate.mjs';

const DEFAULT_LOG_MD = path.join('docs', 'plans', '2026-03-03-implementation-conformance-log.md');
const DEFAULT_LOG_JSONL = path.join(
  'docs',
  'plans',
  '2026-03-03-implementation-conformance-log.jsonl'
);

function stableSort(value) {
  if (Array.isArray(value)) {
    return value.map(item => stableSort(item));
  }

  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        acc[key] = stableSort(value[key]);
        return acc;
      }, {});
  }

  return value;
}

function stableStringify(value) {
  return JSON.stringify(stableSort(value));
}

function sha256(payload) {
  return crypto.createHash('sha256').update(payload).digest('hex');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8'));
}

function parseJsonl(logPath) {
  if (!fs.existsSync(logPath)) {
    return [];
  }

  const contents = fs.readFileSync(logPath, 'utf8');
  const lines = contents.split('\n');
  const entries = [];

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    try {
      entries.push(JSON.parse(line));
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'invalid JSON';
      throw new Error(`invalid JSONL at line ${index + 1}: ${reason}`);
    }
  }

  return entries;
}

function buildHashMaterial(entryCore) {
  return stableStringify(entryCore);
}

export function verifyAuditChain(auditPath) {
  let entries = [];
  try {
    entries = parseJsonl(auditPath);
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'invalid JSONL';
    return {
      ok: false,
      reason: `unable to parse audit log (${reason})`,
      entries: [],
    };
  }

  let previousHash = 'GENESIS';
  let previousTimestamp = null;

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const { entry_hash: entryHash, ...entryWithoutHash } = entry;
    const expectedPreviousHash = entryWithoutHash.previous_hash || 'GENESIS';

    if (expectedPreviousHash !== previousHash) {
      return {
        ok: false,
        reason: `hash chain mismatch at line ${index + 1}`,
        entries,
      };
    }

    const material = buildHashMaterial(entryWithoutHash);
    const recomputed = sha256(material);
    if (recomputed !== entryHash) {
      return {
        ok: false,
        reason: `entry hash mismatch at line ${index + 1}`,
        entries,
      };
    }

    const timestamp = entryWithoutHash.timestamp;
    if (previousTimestamp && String(timestamp) < String(previousTimestamp)) {
      return {
        ok: false,
        reason: `timestamp order violation at line ${index + 1}`,
        entries,
      };
    }

    previousTimestamp = timestamp;
    previousHash = entryHash;
  }

  return {
    ok: true,
    reason: 'ok',
    entries,
    last_hash: previousHash,
  };
}

function appendMarkdownLog(logMdPath, entry) {
  const summary = [
    `\n### ${entry.timestamp} - ${entry.step_id} (${entry.epic_id})`,
    '',
    `- mode: \`${entry.mode}\``,
    `- decision: \`${entry.decision}\``,
    `- result: \`${entry.result}\``,
    `- variance: \`${entry.variance ? 'yes' : 'no'}\``,
    `- owner: \`${entry.owner}\``,
    `- files_changed: ${entry.files_changed.map(file => `\`${file}\``).join(', ') || 'none'}`,
    `- checks: ${entry.checks
      .map(check => `${check.name}=${check.status}${check.required === false ? '(advisory)' : ''}`)
      .join(', ')}`,
    `- entry_hash: \`${entry.entry_hash}\``,
  ];

  fs.appendFileSync(logMdPath, `${summary.join('\n')}\n`, 'utf8');
}

export function appendAuditEntry({ record, auditPath, logMdPath }) {
  const validation = validateConformanceRecord(record);
  if (!validation.ok) {
    throw new Error(`record failed conformance validation: ${validation.errors.join('; ')}`);
  }

  fs.mkdirSync(path.dirname(auditPath), { recursive: true });
  fs.mkdirSync(path.dirname(logMdPath), { recursive: true });

  const verifyBefore = verifyAuditChain(auditPath);
  if (!verifyBefore.ok) {
    throw new Error(`cannot append: audit chain invalid (${verifyBefore.reason})`);
  }

  const previousHash = verifyBefore.last_hash || 'GENESIS';

  const coreEntry = {
    ...record,
    previous_hash: previousHash,
  };

  const entry = {
    ...coreEntry,
    entry_hash: sha256(buildHashMaterial(coreEntry)),
  };

  fs.appendFileSync(auditPath, `${JSON.stringify(entry)}\n`, 'utf8');
  appendMarkdownLog(logMdPath, entry);
  return entry;
}

function printUsage() {
  console.log(`plan-conformance log

Usage:
  node scripts/plan-conformance/log.mjs append --record <path> [--audit-jsonl <path>] [--log-md <path>]
  node scripts/plan-conformance/log.mjs verify [--audit-jsonl <path>]
`);
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const args = {
    command: command || '',
    recordPath: '',
    auditJsonlPath: DEFAULT_LOG_JSONL,
    logMdPath: DEFAULT_LOG_MD,
  };

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    const next = rest[index + 1];

    if (token === '--record' && next) {
      args.recordPath = next;
      index += 1;
      continue;
    }

    if (token === '--audit-jsonl' && next) {
      args.auditJsonlPath = next;
      index += 1;
      continue;
    }

    if (token === '--log-md' && next) {
      args.logMdPath = next;
      index += 1;
      continue;
    }

    if (token === '-h' || token === '--help') {
      args.command = 'help';
    }
  }

  return args;
}

function runAppend(args) {
  if (!args.recordPath) {
    throw new Error('append requires --record');
  }

  const record = readJson(args.recordPath);
  const entry = appendAuditEntry({
    record,
    auditPath: path.resolve(args.auditJsonlPath),
    logMdPath: path.resolve(args.logMdPath),
  });

  process.stdout.write(`${JSON.stringify({ ok: true, entry_hash: entry.entry_hash }, null, 2)}\n`);
}

function runVerify(args) {
  const result = verifyAuditChain(path.resolve(args.auditJsonlPath));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) {
    process.exitCode = 1;
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.command === 'help' || !args.command) {
    printUsage();
    return;
  }

  if (args.command === 'append') {
    runAppend(args);
    return;
  }

  if (args.command === 'verify') {
    runVerify(args);
    return;
  }

  throw new Error(`Unknown command: ${args.command}`);
}

function isDirectExecution() {
  if (!process.argv[1]) return false;
  return pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
}

if (isDirectExecution()) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`[plan-conformance/log] FAIL: ${error.message}\n`);
    process.exit(1);
  }
}
