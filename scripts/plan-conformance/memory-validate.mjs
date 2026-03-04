#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { computeDeterministicMemoryId } from './memory-id.mjs';

const DEFAULT_REGISTRY_PATH = path.join('docs', 'plans', '2026-03-03-memory-registry.jsonl');
const VALID_STATUSES = new Set(['candidate', 'validated', 'canonical', 'obsolete']);
const VALID_STORE_TYPES = new Set(['episodic', 'procedural', 'semantic']);
const VALID_PROMOTION_RULES = new Set(['auto_policy', 'owner_approval', 'hitl_required']);
const VALID_SCOPE_KEYS = new Set(['file_path', 'route', 'table', 'tenant']);

function isIsoDate(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return false;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isStringArray(value) {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

function parseJsonlFile(registryPath) {
  const absolutePath = path.resolve(registryPath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`memory registry not found: ${absolutePath}`);
  }

  const lines = fs
    .readFileSync(absolutePath, 'utf8')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  return lines.map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      throw new Error(`invalid JSON on line ${index + 1}: ${error.message}`);
    }
  });
}

function validateScope(scope, errors) {
  if (!scope || typeof scope !== 'object' || Array.isArray(scope)) {
    errors.push('scope must be an object');
    return;
  }

  const keys = Object.keys(scope);
  if (keys.length === 0) {
    errors.push('scope must include at least one key');
  }

  for (const key of keys) {
    if (!VALID_SCOPE_KEYS.has(key)) {
      errors.push(`scope key not allowed: ${key}`);
      continue;
    }

    if (!isNonEmptyString(scope[key])) {
      errors.push(`scope.${key} must be a non-empty string`);
    }
  }
}

function validateRecordShape(record, lineNumber) {
  const errors = [];

  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    return {
      line: lineNumber,
      ok: false,
      errors: ['record must be an object'],
    };
  }

  if (!isNonEmptyString(record.id)) {
    errors.push('id must be a non-empty string');
  }

  if (isNonEmptyString(record.id)) {
    const expectedId = computeDeterministicMemoryId(record);
    if (record.id !== expectedId) {
      errors.push(`id must match deterministic seed (expected ${expectedId})`);
    }
  }

  if (!VALID_STATUSES.has(record.status)) {
    errors.push(`status must be one of: ${Array.from(VALID_STATUSES).join(', ')}`);
  }

  if (!VALID_STORE_TYPES.has(record.store_type)) {
    errors.push(`store_type must be one of: ${Array.from(VALID_STORE_TYPES).join(', ')}`);
  }

  if (!isNonEmptyString(record.trigger_signature)) {
    errors.push('trigger_signature must be a non-empty string');
  }

  if (!isNonEmptyString(record.risk_class)) {
    errors.push('risk_class must be a non-empty string');
  }

  validateScope(record.scope, errors);

  if (!isNonEmptyString(record.lesson)) {
    errors.push('lesson must be a non-empty string');
  }

  if (!isStringArray(record.verification_commands)) {
    errors.push('verification_commands must be a string array');
  }

  if (!VALID_PROMOTION_RULES.has(record.promotion_rule)) {
    errors.push(
      `promotion_rule must be one of: ${Array.from(VALID_PROMOTION_RULES).join(', ')}`
    );
  }

  if (!isStringArray(record.supersedes)) {
    errors.push('supersedes must be a string array');
  }

  if (!isStringArray(record.conflicts_with)) {
    errors.push('conflicts_with must be a string array');
  }

  if (!isIsoDate(record.created_at)) {
    errors.push('created_at must be an ISO-parseable date string');
  }

  if (!isIsoDate(record.updated_at)) {
    errors.push('updated_at must be an ISO-parseable date string');
  }

  return {
    line: lineNumber,
    ok: errors.length === 0,
    errors,
  };
}

export function validateMemoryRegistry(records) {
  const problems = [];
  const duplicateIds = new Set();
  const ids = new Set();

  records.forEach((record, index) => {
    if (isNonEmptyString(record?.id)) {
      if (ids.has(record.id)) {
        duplicateIds.add(record.id);
      }
      ids.add(record.id);
    }

    const validation = validateRecordShape(record, index + 1);
    if (!validation.ok) {
      problems.push(validation);
      return;
    }
  });

  if (duplicateIds.size > 0) {
    problems.push({
      line: 0,
      ok: false,
      errors: [`duplicate ids: ${Array.from(duplicateIds).join(', ')}`],
    });
  }

  return {
    ok: problems.length === 0,
    count: records.length,
    problems,
  };
}

function printUsage() {
  console.log(`memory-validate\n\nUsage:\n  node scripts/plan-conformance/memory-validate.mjs [--registry <path>] [--report <path>]\n`);
}

function parseArgs(argv) {
  const args = {
    registryPath: DEFAULT_REGISTRY_PATH,
    reportPath: '',
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];

    if (token === '--registry' && next) {
      args.registryPath = next;
      index += 1;
      continue;
    }

    if (token === '--report' && next) {
      args.reportPath = next;
      index += 1;
      continue;
    }

    if (token === '-h' || token === '--help') {
      args.help = true;
      continue;
    }
  }

  return args;
}

function writeReport(reportPath, payload) {
  const absolutePath = path.resolve(reportPath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    return;
  }

  const records = parseJsonlFile(args.registryPath);
  const result = validateMemoryRegistry(records);

  const payload = {
    registry: path.resolve(args.registryPath),
    validated_at: new Date().toISOString(),
    ...result,
  };

  if (args.reportPath) {
    writeReport(args.reportPath, payload);
  }

  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  if (!result.ok) {
    process.exitCode = 1;
  }
}

function isDirectExecution() {
  if (!process.argv[1]) return false;
  return pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
}

if (isDirectExecution()) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`[memory-validate] FAIL: ${error.message}\n`);
    process.exit(1);
  }
}
