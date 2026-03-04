#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_REGISTRY_PATH = path.join('docs', 'plans', '2026-03-03-memory-registry.jsonl');
const DEFAULT_INDEX_PATH = path.join('docs', 'plans', '2026-03-03-memory-index.json');

function parseRegistry(registryPath) {
  const absolutePath = path.resolve(registryPath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`registry file not found: ${absolutePath}`);
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

function ensureMapSet(map, key) {
  if (!map.has(key)) {
    map.set(key, new Set());
  }
  return map.get(key);
}

function pushIndexKey(map, key, id) {
  if (typeof key !== 'string' || key.trim().length === 0) {
    return;
  }

  ensureMapSet(map, key.trim()).add(id);
}

function toSortedArrayMap(setMap) {
  return Array.from(setMap.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .reduce((acc, [key, values]) => {
      acc[key] = Array.from(values).sort();
      return acc;
    }, Object.create(null));
}

export function buildMemoryIndex(records) {
  const triggerSignature = new Map();
  const filePath = new Map();
  const route = new Map();
  const table = new Map();
  const tenant = new Map();
  const riskClass = new Map();

  for (const record of records) {
    if (!record || typeof record !== 'object') continue;
    const id = record.id;
    if (typeof id !== 'string' || id.trim().length === 0) continue;

    pushIndexKey(triggerSignature, record.trigger_signature, id);
    pushIndexKey(filePath, record.scope?.file_path, id);
    pushIndexKey(route, record.scope?.route, id);
    pushIndexKey(table, record.scope?.table, id);
    pushIndexKey(tenant, record.scope?.tenant, id);
    pushIndexKey(riskClass, record.risk_class, id);
  }

  return {
    version: '1.0.0',
    generated_at: new Date().toISOString(),
    count: records.length,
    keys: {
      trigger_signature: toSortedArrayMap(triggerSignature),
      file_path: toSortedArrayMap(filePath),
      route: toSortedArrayMap(route),
      table: toSortedArrayMap(table),
      tenant: toSortedArrayMap(tenant),
      risk_class: toSortedArrayMap(riskClass),
    },
  };
}

function writeIndex(indexPath, payload) {
  const absolutePath = path.resolve(indexPath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function printUsage() {
  console.log(
    `memory-index\n\nUsage:\n  node scripts/plan-conformance/memory-index.mjs [--registry <path>] [--out <path>]\n`
  );
}

function parseArgs(argv) {
  const args = {
    registryPath: DEFAULT_REGISTRY_PATH,
    indexPath: DEFAULT_INDEX_PATH,
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

    if (token === '--out' && next) {
      args.indexPath = next;
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

  const records = parseRegistry(args.registryPath);
  const payload = buildMemoryIndex(records);
  writeIndex(args.indexPath, payload);
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
    process.stderr.write(`[memory-index] FAIL: ${error.message}\n`);
    process.exit(1);
  }
}
