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

function fetchChecksJson(prRef = '', requiredOnly = true) {
  const args = ['pr', 'checks'];
  if (prRef) {
    args.push(prRef);
  }
  if (requiredOnly) {
    args.push('--required');
  }
  args.push('--json', 'bucket,completedAt,description,link,name,startedAt,state,workflow');

  const output = execFileSync('gh', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  return JSON.parse(output);
}

function selectFirstMappedFailure(checksPayload) {
  const failures = normalizeChecksPayload(checksPayload).filter(check => check?.bucket === 'fail');

  for (const check of failures) {
    const name = String(check.name || '').toLowerCase();
    const workflow = String(check.workflow || '').toLowerCase();
    const description = String(check.description || '');

    if (name.includes('static')) {
      return {
        event_type: 'ci.static.failure',
        lesson_hint: `PR check "${check.name}" failed. Re-run local fast verification before trusting static CI failures.`,
        check,
      };
    }

    if (name.includes('e2e-gate') || workflow.includes('e2e')) {
      return {
        event_type: 'ci.e2e_gate.failure',
        lesson_hint: `PR check "${check.name}" failed. Re-run tenant-aware RLS and gate flows before pushing again.`,
        check,
      };
    }

    if (name.includes('boundary') || description.toLowerCase().includes('boundary')) {
      return {
        event_type: 'ci.boundary.review_block',
        lesson_hint: `PR check "${check.name}" reported a boundary-sensitive blocker. Re-run boundary guardrails before pushing.`,
        check,
      };
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

function parseArgs(argv) {
  const args = {
    checksJsonPath: '',
    prRef: '',
    sourceMapPath: DEFAULT_SOURCE_MAP_PATH,
    eventOut: DEFAULT_EVENT_OUT,
    captureOut: DEFAULT_CAPTURE_OUT,
    requiredOnly: true,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];

    if (token === '--checks-json' && next) {
      args.checksJsonPath = next;
      index += 1;
      continue;
    }

    if (token === '--pr' && next) {
      args.prRef = next;
      index += 1;
      continue;
    }

    if (token === '--source-map' && next) {
      args.sourceMapPath = next;
      index += 1;
      continue;
    }

    if (token === '--event-out' && next) {
      args.eventOut = next;
      index += 1;
      continue;
    }

    if (token === '--capture-out' && next) {
      args.captureOut = next;
      index += 1;
      continue;
    }

    if (token === '--all') {
      args.requiredOnly = false;
      continue;
    }

    if (token === '-h' || token === '--help') {
      args.help = true;
    }
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
