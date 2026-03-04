#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_RETRIEVAL_PATH = path.join('tmp', 'plan-conformance', 'advisory-retrieval-report.json');
const DEFAULT_OUT_PATH = path.join('tmp', 'plan-conformance', 'advisory-signal-report.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8'));
}

function writeJson(filePath, payload) {
  const absolutePath = path.resolve(filePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(item => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
    .filter((item, index, all) => all.indexOf(item) === index);
}

function clampUsefulness(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  if (value < 0) {
    return 0;
  }

  if (value > 100) {
    return 100;
  }

  return Math.round(value * 100) / 100;
}

function buildRunId(explicitRunId) {
  if (typeof explicitRunId === 'string' && explicitRunId.trim().length > 0) {
    return explicitRunId.trim();
  }

  const compact = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
  return `run_${compact}`;
}

function validateRetrievalPayload(retrievalPayload) {
  if (!retrievalPayload || typeof retrievalPayload !== 'object') {
    throw new Error('retrieval payload must be an object');
  }

  if (!Array.isArray(retrievalPayload.hits)) {
    throw new Error('retrieval payload must include hits[]');
  }
}

export function buildAdvisorySignalReport({ retrievalPayload, context = {}, runId = '' }) {
  validateRetrievalPayload(retrievalPayload);

  const retrievalHits = retrievalPayload.hits
    .map(hit => (typeof hit?.id === 'string' ? hit.id.trim() : ''))
    .filter(Boolean)
    .filter((id, index, all) => all.indexOf(id) === index);

  return {
    run_id: buildRunId(runId),
    retrieval_hits: retrievalHits,
    noise_flags: normalizeStringArray(context.noise_flags),
    boundary_findings: normalizeStringArray(context.boundary_findings),
    usefulness_score: clampUsefulness(Number(context.usefulness_score ?? 0)),
    retrieval_count: retrievalHits.length,
  };
}

function printUsage() {
  console.log(
    'memory-advisory-report\\n\\nUsage:\\n  node scripts/plan-conformance/memory-advisory-report.mjs [--retrieval <path>] [--context <path>] [--run-id <id>] [--out <path>]'
  );
}

function parseArgs(argv) {
  const args = {
    retrievalPath: DEFAULT_RETRIEVAL_PATH,
    contextPath: '',
    runId: '',
    outPath: DEFAULT_OUT_PATH,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];

    if (token === '--retrieval' && next) {
      args.retrievalPath = next;
      index += 1;
      continue;
    }

    if (token === '--context' && next) {
      args.contextPath = next;
      index += 1;
      continue;
    }

    if (token === '--run-id' && next) {
      args.runId = next;
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

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    return;
  }

  const retrievalPayload = readJson(args.retrievalPath);
  const context = args.contextPath ? readJson(args.contextPath) : {};

  const report = buildAdvisorySignalReport({
    retrievalPayload,
    context,
    runId: args.runId,
  });

  writeJson(args.outPath, report);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

function isDirectExecution() {
  if (!process.argv[1]) return false;
  return pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
}

if (isDirectExecution()) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`[memory-advisory-report] FAIL: ${error.message}\n`);
    process.exit(1);
  }
}
