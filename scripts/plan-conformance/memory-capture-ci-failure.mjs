#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { captureCandidateFromEvent } from './memory-candidate-capture.mjs';

const DEFAULT_SOURCE_MAP_PATH = path.join(
  'scripts',
  'plan-conformance',
  'candidate-capture-sources.json'
);
const DEFAULT_EVENT_OUT = path.join('tmp', 'plan-conformance', 'ci-memory-event.json');
const DEFAULT_CAPTURE_OUT = path.join('tmp', 'plan-conformance', 'ci-memory-capture.json');
const TRUSTED_PATH_SEGMENTS = [
  '/opt/homebrew/bin',
  '/usr/local/bin',
  '/usr/bin',
  '/bin',
  '/usr/sbin',
  '/sbin',
];
const GH_EXECUTABLE_CANDIDATES = ['gh'];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8'));
}

function writeJson(filePath, payload) {
  const absolutePath = path.resolve(filePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function normalizeChecksPayload(payload) {
  return Array.isArray(payload) ? payload : [];
}

export function resolveTrustedExecutable(candidates) {
  for (const segment of TRUSTED_PATH_SEGMENTS) {
    for (const candidate of candidates) {
      const candidatePath = path.join(segment, candidate);
      if (fs.existsSync(candidatePath)) {
        return candidatePath;
      }
    }
  }

  throw new Error(`trusted executable not found for candidates: ${candidates.join(', ')}`);
}

function fetchChecksJson(prRef = '', requiredOnly = true) {
  const args = ['pr', 'checks'];
  if (prRef) {
    args.push(prRef);
  }
  if (requiredOnly) {
    args.push('--required');
  }
  args.push('--json', 'bucket,completedAt,description,link,name,startedAt,state,workflow');

  const output = execFileSync(resolveTrustedExecutable(GH_EXECUTABLE_CANDIDATES), args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  return JSON.parse(output);
}

function buildMappedFailure(check, eventType, lessonHint) {
  return {
    event_type: eventType,
    lesson_hint: lessonHint,
    check,
  };
}

const FAILURE_DETECTORS = [
  {
    matches: ({ name }) => name.includes('static'),
    toMappedFailure: check =>
      buildMappedFailure(
        check,
        'ci.static.failure',
        `PR check "${check.name}" failed. Re-run local fast verification before trusting static CI failures.`
      ),
  },
  {
    matches: ({ name, workflow }) => name.includes('e2e-gate') || workflow.includes('e2e'),
    toMappedFailure: check =>
      buildMappedFailure(
        check,
        'ci.e2e_gate.failure',
        `PR check "${check.name}" failed. Re-run tenant-aware RLS and gate flows before pushing again.`
      ),
  },
  {
    matches: ({ name, description }) =>
      name.includes('boundary') || description.toLowerCase().includes('boundary'),
    toMappedFailure: check =>
      buildMappedFailure(
        check,
        'ci.boundary.review_block',
        `PR check "${check.name}" reported a boundary-sensitive blocker. Re-run boundary guardrails before pushing.`
      ),
  },
];

function normalizeCheckContext(check) {
  return {
    name: String(check.name || '').toLowerCase(),
    workflow: String(check.workflow || '').toLowerCase(),
    description: String(check.description || ''),
  };
}

export function selectFirstMappedFailure(checksPayload) {
  const failures = normalizeChecksPayload(checksPayload).filter(check => check?.bucket === 'fail');

  for (const check of failures) {
    const context = normalizeCheckContext(check);

    for (const detector of FAILURE_DETECTORS) {
      if (detector.matches(context)) {
        return detector.toMappedFailure(check);
      }
    }
  }

  return null;
}

export function captureCiFailureMemory({
  checksPayload = [],
  sourceMapPath = DEFAULT_SOURCE_MAP_PATH,
} = {}) {
  const mappedFailure = selectFirstMappedFailure(checksPayload);

  if (!mappedFailure) {
    return {
      ok: true,
      event: null,
      capture: null,
      message: 'No mapped failing check was found in the supplied payload.',
    };
  }

  const event = {
    event_type: mappedFailure.event_type,
    timestamp: mappedFailure.check.completedAt || new Date().toISOString(),
    lesson_hint: mappedFailure.lesson_hint,
  };

  const sourceMap = readJson(sourceMapPath);
  const capture = captureCandidateFromEvent(event, sourceMap);

  return {
    ok: true,
    event,
    capture,
    check: mappedFailure.check,
  };
}

function printUsage() {
  console.log(
    'memory-capture-ci-failure\n\nUsage:\n  node scripts/plan-conformance/memory-capture-ci-failure.mjs [--checks-json <path> | --pr <ref>] [--source-map <path>] [--event-out <path>] [--capture-out <path>] [--all]'
  );
}

function createArgs() {
  return {
    checksJsonPath: '',
    prRef: '',
    sourceMapPath: DEFAULT_SOURCE_MAP_PATH,
    eventOut: DEFAULT_EVENT_OUT,
    captureOut: DEFAULT_CAPTURE_OUT,
    requiredOnly: true,
    help: false,
  };
}

function consumeValue(args, token, next) {
  if (token === '--checks-json' && next) {
    args.checksJsonPath = next;
    return true;
  }

  if (token === '--pr' && next) {
    args.prRef = next;
    return true;
  }

  if (token === '--source-map' && next) {
    args.sourceMapPath = next;
    return true;
  }

  if (token === '--event-out' && next) {
    args.eventOut = next;
    return true;
  }

  if (token === '--capture-out' && next) {
    args.captureOut = next;
    return true;
  }

  return false;
}

function consumeFlag(args, token) {
  if (token === '--all') {
    args.requiredOnly = false;
    return;
  }

  if (token === '-h' || token === '--help') {
    args.help = true;
  }
}

export function parseArgs(argv) {
  const args = createArgs();

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];

    if (consumeValue(args, token, next)) {
      index += 1;
      continue;
    }

    consumeFlag(args, token);
  }

  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    return;
  }

  try {
    const checksPayload = args.checksJsonPath
      ? readJson(args.checksJsonPath)
      : fetchChecksJson(args.prRef, args.requiredOnly);
    const result = captureCiFailureMemory({
      checksPayload,
      sourceMapPath: args.sourceMapPath,
    });

    if (!result.event || !result.capture) {
      process.stdout.write('[memory-capture-ci-failure] no mapped failing check found; nothing captured\n');
      return;
    }

    writeJson(args.eventOut, result.event);
    writeJson(args.captureOut, result.capture);
    process.stdout.write(
      `[memory-capture-ci-failure] captured ${result.event.event_type} -> ${result.capture.source_id}\n`
    );
  } catch (error) {
    process.stdout.write(
      `[memory-capture-ci-failure] capture unavailable: ${error instanceof Error ? error.message : String(error)}\n`
    );
    process.exitCode = 0;
  }
}

function isDirectExecution() {
  if (!process.argv[1]) return false;
  return pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
}

if (isDirectExecution()) {
  main();
}
