#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { computeDeterministicMemoryId } from './memory-id.mjs';

const DEFAULT_SOURCE_MAP = path.join('scripts', 'plan-conformance', 'candidate-capture-sources.json');
const DEFAULT_OUT = path.join('tmp', 'plan-conformance', 'captured-candidate-memory.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8'));
}

function printUsage() {
  console.log(`memory-candidate-capture\n\nUsage:\n  node scripts/plan-conformance/memory-candidate-capture.mjs --event <event.json> [--source-map <path>] [--out <path>]\n`);
}

function parseArgs(argv) {
  const args = {
    sourceMapPath: DEFAULT_SOURCE_MAP,
    eventPath: '',
    outPath: DEFAULT_OUT,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];

    if (token === '--source-map' && next) {
      args.sourceMapPath = next;
      index += 1;
      continue;
    }

    if (token === '--event' && next) {
      args.eventPath = next;
      index += 1;
      continue;
    }

    if (token === '--out' && next) {
      args.outPath = next;
      index += 1;
      continue;
    }

    if (token === '-h' || token === '--help') {
      args.help = true;
    }
  }

  return args;
}

function matchSource(event, sourceMap) {
  const sources = Array.isArray(sourceMap?.sources) ? sourceMap.sources : [];
  return (
    sources.find(source => {
      const expectedType = source?.trigger_match?.event_type;
      return typeof expectedType === 'string' && expectedType === event?.event_type;
    }) || null
  );
}

function toIso(value) {
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      return new Date(parsed).toISOString();
    }
  }

  return new Date().toISOString();
}

export function captureCandidateFromEvent(event, sourceMap) {
  if (!event || typeof event !== 'object') {
    throw new Error('event payload must be an object');
  }

  const source = matchSource(event, sourceMap);
  if (!source) {
    throw new Error(`no candidate capture source matched event_type=${event.event_type || '<unknown>'}`);
  }

  const now = toIso(event.timestamp);
  const scope = {
    ...(source.default_scope || {}),
    ...(event.scope || {}),
  };

  const record = {
    id: '',
    status: 'candidate',
    store_type: source.store_type,
    trigger_signature: String(event.event_type),
    risk_class: source.risk_class,
    scope,
    lesson:
      typeof event.lesson_hint === 'string' && event.lesson_hint.trim().length > 0
        ? event.lesson_hint.trim()
        : `Candidate lesson captured from ${event.event_type}`,
    verification_commands: Array.isArray(source.verification_commands)
      ? source.verification_commands
      : [],
    promotion_rule: source.promotion_rule,
    supersedes: [],
    conflicts_with: [],
    created_at: now,
    updated_at: now,
  };

  record.id = computeDeterministicMemoryId(record);

  return {
    source_id: source.source_id,
    event_type: event.event_type,
    record,
  };
}

function writeJson(filePath, payload) {
  const absolutePath = path.resolve(filePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    return;
  }

  if (!args.eventPath) {
    throw new Error('--event is required');
  }

  const sourceMap = readJson(args.sourceMapPath);
  const event = readJson(args.eventPath);
  const payload = captureCandidateFromEvent(event, sourceMap);
  writeJson(args.outPath, payload);
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function isDirectExecution() {
  if (!process.argv[1]) return false;
  return pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
}

if (isDirectExecution()) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`[memory-candidate-capture] FAIL: ${error.message}\n`);
    process.exit(1);
  }
}
