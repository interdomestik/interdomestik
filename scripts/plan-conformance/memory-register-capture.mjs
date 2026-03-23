#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { validateMemoryRegistry } from './memory-validate.mjs';

const DEFAULT_REGISTRY_PATH = path.join('docs', 'plans', '2026-03-03-memory-registry.jsonl');
const DEFAULT_OUT_PATH = path.join('tmp', 'plan-conformance', 'memory-register-capture-decision.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8'));
}

function parseJsonl(filePath) {
  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) {
    return [];
  }

  return fs
    .readFileSync(absolutePath, 'utf8')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`invalid JSON on line ${index + 1}: ${error.message}`);
      }
    });
}

function writeJson(filePath, payload) {
  const absolutePath = path.resolve(filePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function appendJsonl(filePath, record) {
  const absolutePath = path.resolve(filePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.appendFileSync(absolutePath, `${JSON.stringify(record)}\n`, 'utf8');
}

export function registerCapturedMemory({
  capturePayload,
  registryPath = DEFAULT_REGISTRY_PATH,
  apply = false,
} = {}) {
  if (!capturePayload || typeof capturePayload !== 'object') {
    throw new Error('capture payload must be an object');
  }

  const record = capturePayload.record;
  if (!record || typeof record !== 'object') {
    throw new Error('capture payload must include record');
  }

  if (typeof record.id !== 'string' || record.id.trim().length === 0) {
    throw new Error('capture record must include a non-empty id');
  }

  const validation = validateCapturedRecord(record);
  if (!validation.ok) {
    return {
      ok: false,
      registry: path.resolve(registryPath),
      record,
      exists: false,
      append_line: '',
      action: 'invalid_capture',
      validation_problems: validation.problems,
    };
  }

  const registryRecords = parseJsonl(registryPath);
  const exists = registryRecords.some(entry => entry?.id === record.id);
  const action = determineRegisterAction({ exists, apply });

  const decision = {
    ok: true,
    registry: path.resolve(registryPath),
    record,
    exists,
    append_line: exists ? '' : JSON.stringify(record),
    action,
  };

  if (!exists && apply) {
    appendJsonl(registryPath, record);
  }

  return decision;
}

export function determineRegisterAction({ exists, apply }) {
  if (exists) {
    return 'already_registered';
  }

  if (apply) {
    return 'appended';
  }

  return 'append_ready';
}

export function validateCapturedRecord(record) {
  return validateMemoryRegistry([record]);
}

function printUsage() {
  console.log(
    'memory-register-capture\n\nUsage:\n  node scripts/plan-conformance/memory-register-capture.mjs --capture <path> [--registry <path>] [--out <path>] [--apply]'
  );
}

function parseArgs(argv) {
  const args = {
    capturePath: '',
    registryPath: DEFAULT_REGISTRY_PATH,
    outPath: DEFAULT_OUT_PATH,
    apply: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];

    if (token === '--capture' && next) {
      args.capturePath = next;
      index += 1;
      continue;
    }

    if (token === '--registry' && next) {
      args.registryPath = next;
      index += 1;
      continue;
    }

    if (token === '--out' && next) {
      args.outPath = next;
      index += 1;
      continue;
    }

    if (token === '--apply') {
      args.apply = true;
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

  if (!args.capturePath) {
    throw new Error('--capture is required');
  }

  const capturePayload = readJson(args.capturePath);
  const decision = registerCapturedMemory({
    capturePayload,
    registryPath: args.registryPath,
    apply: args.apply,
  });

  writeJson(args.outPath, decision);
  process.stdout.write(`${JSON.stringify(decision, null, 2)}\n`);
}

function isDirectExecution() {
  if (!process.argv[1]) return false;
  return pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
}

if (isDirectExecution()) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`[memory-register-capture] FAIL: ${error.message}\n`);
    process.exit(1);
  }
}
