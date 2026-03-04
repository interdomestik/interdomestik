#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { buildMemoryIndex } from './memory-index.mjs';

const DEFAULT_REGISTRY_PATH = path.join('docs', 'plans', '2026-03-03-memory-registry.jsonl');
const DEFAULT_INDEX_PATH = path.join('docs', 'plans', '2026-03-03-memory-index.json');
const DEFAULT_OUT_PATH = path.join('tmp', 'plan-conformance', 'advisory-retrieval-report.json');
const DEFAULT_LIMIT = 5;
const DEFAULT_INCLUDE_STATUSES = ['candidate', 'validated', 'canonical'];
const STATUS_RANK = {
  canonical: 0,
  validated: 1,
  candidate: 2,
  obsolete: 3,
};

const FIELD_WEIGHTS = {
  trigger_signature: 5,
  risk_class: 2,
  file_path: 3,
  route: 3,
  table: 3,
  tenant: 4,
};

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8'));
}

function parseRegistry(registryPath) {
  const absolutePath = path.resolve(registryPath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`memory registry not found: ${absolutePath}`);
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

function normalizeScope(scope) {
  const normalized = {};
  const keys = ['file_path', 'route', 'table', 'tenant'];

  for (const key of keys) {
    const value = scope?.[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      normalized[key] = value.trim();
    }
  }

  return normalized;
}

function normalizeStatusList(statuses) {
  if (!Array.isArray(statuses) || statuses.length === 0) {
    return [...DEFAULT_INCLUDE_STATUSES];
  }

  const out = statuses
    .map(status => (typeof status === 'string' ? status.trim() : ''))
    .filter(Boolean)
    .filter((status, index, all) => all.indexOf(status) === index);

  return out.length > 0 ? out : [...DEFAULT_INCLUDE_STATUSES];
}

function normalizeQuery(query) {
  const normalized = {
    trigger_signature:
      typeof query?.trigger_signature === 'string' && query.trigger_signature.trim().length > 0
        ? query.trigger_signature.trim()
        : '',
    risk_class:
      typeof query?.risk_class === 'string' && query.risk_class.trim().length > 0
        ? query.risk_class.trim()
        : '',
    scope: normalizeScope(query?.scope),
    include_statuses: normalizeStatusList(query?.include_statuses),
  };

  return normalized;
}

function validateIndex(index) {
  if (!index || typeof index !== 'object') {
    throw new Error('index payload must be an object');
  }

  if (!index.keys || typeof index.keys !== 'object') {
    throw new Error('index payload missing keys object');
  }
}

function getIndexedIds(index, keyType, key) {
  if (!key) {
    return [];
  }

  const bucket = index.keys?.[keyType];
  if (!bucket || typeof bucket !== 'object') {
    return [];
  }

  const ids = bucket[key];
  return Array.isArray(ids) ? ids : [];
}

function addWeightedHits(scoreMap, ids, weight) {
  for (const id of ids) {
    const current = scoreMap.get(id) || 0;
    scoreMap.set(id, current + weight);
  }
}

function statusPriority(status) {
  return Number.isInteger(STATUS_RANK[status]) ? STATUS_RANK[status] : 99;
}

export function retrieveAdvisoryLessons({ records, index, query, limit = DEFAULT_LIMIT }) {
  const normalizedQuery = normalizeQuery(query);
  const hasQuerySignal =
    Boolean(normalizedQuery.trigger_signature) ||
    Boolean(normalizedQuery.risk_class) ||
    Object.keys(normalizedQuery.scope).length > 0;

  if (!hasQuerySignal) {
    throw new Error('query must include at least one retrieval signal');
  }

  validateIndex(index);

  const scoreMap = new Map();
  const recordMap = new Map();
  const allowedStatuses = new Set(normalizedQuery.include_statuses);

  for (const record of records) {
    if (record && typeof record === 'object' && typeof record.id === 'string') {
      recordMap.set(record.id, record);
    }
  }

  addWeightedHits(
    scoreMap,
    getIndexedIds(index, 'trigger_signature', normalizedQuery.trigger_signature),
    FIELD_WEIGHTS.trigger_signature
  );

  addWeightedHits(
    scoreMap,
    getIndexedIds(index, 'risk_class', normalizedQuery.risk_class),
    FIELD_WEIGHTS.risk_class
  );

  const scope = normalizedQuery.scope;
  addWeightedHits(scoreMap, getIndexedIds(index, 'file_path', scope.file_path), FIELD_WEIGHTS.file_path);
  addWeightedHits(scoreMap, getIndexedIds(index, 'route', scope.route), FIELD_WEIGHTS.route);
  addWeightedHits(scoreMap, getIndexedIds(index, 'table', scope.table), FIELD_WEIGHTS.table);
  addWeightedHits(scoreMap, getIndexedIds(index, 'tenant', scope.tenant), FIELD_WEIGHTS.tenant);

  const hits = [];

  for (const [id, score] of scoreMap.entries()) {
    const record = recordMap.get(id);
    if (!record) {
      continue;
    }

    if (!allowedStatuses.has(record.status)) {
      continue;
    }

    hits.push({
      id: record.id,
      status: record.status,
      store_type: record.store_type,
      promotion_rule: record.promotion_rule,
      trigger_signature: record.trigger_signature,
      risk_class: record.risk_class,
      scope: record.scope,
      lesson: record.lesson,
      verification_commands: record.verification_commands,
      score,
    });
  }

  hits.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }

    const statusDelta = statusPriority(left.status) - statusPriority(right.status);
    if (statusDelta !== 0) {
      return statusDelta;
    }

    return String(left.id).localeCompare(String(right.id));
  });

  const limitNumber = Number.isInteger(limit) && limit > 0 ? limit : DEFAULT_LIMIT;

  return {
    query: normalizedQuery,
    count: hits.length,
    hits: hits.slice(0, limitNumber),
  };
}

function parseArgs(argv) {
  const args = {
    queryPath: '',
    registryPath: DEFAULT_REGISTRY_PATH,
    indexPath: DEFAULT_INDEX_PATH,
    outPath: DEFAULT_OUT_PATH,
    limit: DEFAULT_LIMIT,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];

    if (token === '--query' && next) {
      args.queryPath = next;
      index += 1;
      continue;
    }

    if (token === '--registry' && next) {
      args.registryPath = next;
      index += 1;
      continue;
    }

    if (token === '--index' && next) {
      args.indexPath = next;
      index += 1;
      continue;
    }

    if (token === '--out' && next) {
      args.outPath = next;
      index += 1;
      continue;
    }

    if (token === '--limit' && next) {
      args.limit = Number.parseInt(next, 10);
      index += 1;
      continue;
    }

    if (token === '-h' || token === '--help') {
      args.help = true;
    }
  }

  return args;
}

function printUsage() {
  console.log(
    'memory-retrieve\\n\\nUsage:\\n  node scripts/plan-conformance/memory-retrieve.mjs --query <path> [--registry <path>] [--index <path>] [--out <path>] [--limit <n>]'
  );
}

function loadIndex(indexPath, records) {
  const absolutePath = path.resolve(indexPath);
  if (!fs.existsSync(absolutePath)) {
    return buildMemoryIndex(records);
  }

  return readJson(absolutePath);
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

  if (!args.queryPath) {
    throw new Error('--query is required');
  }

  const records = parseRegistry(args.registryPath);
  const index = loadIndex(args.indexPath, records);
  const query = readJson(args.queryPath);

  const payload = retrieveAdvisoryLessons({
    records,
    index,
    query,
    limit: args.limit,
  });

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
    process.stderr.write(`[memory-retrieve] FAIL: ${error.message}\n`);
    process.exit(1);
  }
}
