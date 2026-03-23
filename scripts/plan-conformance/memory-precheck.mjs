#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { buildMemoryIndex } from './memory-index.mjs';
import { retrieveAdvisoryLessons } from './memory-retrieve.mjs';
import { validateMemoryRegistry } from './memory-validate.mjs';

const DEFAULT_REGISTRY_PATH = path.join('docs', 'plans', '2026-03-03-memory-registry.jsonl');
const DEFAULT_RULES_PATH = path.join('scripts', 'plan-conformance', 'memory-precheck-rules.json');
const DEFAULT_OUT_PATH = path.join('tmp', 'plan-conformance', 'memory-precheck-report.json');
const DEFAULT_LIMIT = 3;
const TRUSTED_PATH_SEGMENTS = [
  '/opt/homebrew/bin',
  '/usr/local/bin',
  '/usr/bin',
  '/bin',
  '/usr/sbin',
  '/sbin',
];

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

function writeJson(filePath, payload) {
  const absolutePath = path.resolve(filePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeChangedFiles(changedFiles) {
  return changedFiles
    .map(normalizeString)
    .filter(Boolean)
    .filter((item, index, all) => all.indexOf(item) === index)
    .sort((left, right) => left.localeCompare(right));
}

function matchesRule(filePath, rule) {
  const prefix = normalizeString(rule?.match?.path_prefix);
  if (!prefix) {
    return false;
  }

  return filePath === prefix || filePath.startsWith(prefix);
}

function resolveMatchedRules(changedFiles, rules) {
  const matches = [];

  for (const rule of rules) {
    const matchedFiles = changedFiles.filter(filePath => matchesRule(filePath, rule));
    if (matchedFiles.length === 0) {
      continue;
    }

    matches.push({
      id: normalizeString(rule.id) || 'unnamed-rule',
      matched_files: matchedFiles,
      query: rule.query || {},
    });
  }

  return matches;
}

function formatHit(hit) {
  const commands =
    Array.isArray(hit.verification_commands) && hit.verification_commands.length > 0
      ? ` | verify: ${hit.verification_commands.join(', ')}`
      : '';
  return `  - [${hit.status}] ${hit.trigger_signature}: ${hit.lesson}${commands}`;
}

function printSummary(result) {
  process.stdout.write('[memory-precheck] advisory mode only; verification will continue\n');
  process.stdout.write(
    `[memory-precheck] changed=${result.changed_files.length} matched_rules=${result.matched_rule_count} retrievals=${result.retrievals.length}\n`
  );

  if (result.validation_ok === false) {
    process.stdout.write('[memory-precheck] memory registry validation failed; advisory skipped\n');
    return;
  }

  if (result.retrievals.length === 0) {
    process.stdout.write('[memory-precheck] no matching lessons for current diff\n');
    return;
  }

  for (const retrieval of result.retrievals) {
    process.stdout.write(
      `[memory-precheck] rule=${retrieval.rule_id} files=${retrieval.matched_files.join(', ')}\n`
    );
    if (retrieval.hits.length === 0) {
      process.stdout.write('  - no stored lessons matched this rule\n');
      continue;
    }

    for (const hit of retrieval.hits) {
      process.stdout.write(`${formatHit(hit)}\n`);
    }
  }
}

export function buildCommandEnv() {
  const trustedPath = TRUSTED_PATH_SEGMENTS.filter(segment => fs.existsSync(segment)).join(':');
  return {
    ...process.env,
    PATH: trustedPath,
  };
}

function safeGitDiffNameOnly() {
  try {
    const output = execFileSync('git', ['diff', '--name-only', 'HEAD'], {
      encoding: 'utf8',
      env: buildCommandEnv(),
      stdio: ['ignore', 'pipe', 'ignore'],
    });

    return normalizeChangedFiles(output.split('\n'));
  } catch {
    return [];
  }
}

export function runMemoryPrecheck({
  changedFiles = [],
  registryPath = DEFAULT_REGISTRY_PATH,
  rulesPath = DEFAULT_RULES_PATH,
  outPath = DEFAULT_OUT_PATH,
  limit = DEFAULT_LIMIT,
} = {}) {
  const normalizedChangedFiles =
    Array.isArray(changedFiles) && changedFiles.length > 0
      ? normalizeChangedFiles(changedFiles)
      : safeGitDiffNameOnly();
  const rulesPayload = readJson(rulesPath);
  const rules = Array.isArray(rulesPayload?.rules) ? rulesPayload.rules : [];
  const records = parseRegistry(registryPath);
  const validation = validateMemoryRegistry(records);

  const result = {
    ok: true,
    advisory_only: true,
    changed_files: normalizedChangedFiles,
    validation_ok: validation.ok,
    matched_rule_count: 0,
    retrievals: [],
  };

  if (!validation.ok) {
    result.ok = false;
    result.validation_problems = validation.problems;
    writeJson(outPath, result);
    return result;
  }

  const matchedRules = resolveMatchedRules(normalizedChangedFiles, rules);
  result.matched_rule_count = matchedRules.length;

  if (matchedRules.length === 0) {
    writeJson(outPath, result);
    return result;
  }

  const index = buildMemoryIndex(records);
  result.retrievals = matchedRules.map(match => {
    const retrieval = retrieveAdvisoryLessons({
      records,
      index,
      query: match.query,
      limit,
    });

    return {
      rule_id: match.id,
      matched_files: match.matched_files,
      hits: retrieval.hits,
      count: retrieval.count,
      query: retrieval.query,
    };
  });

  writeJson(outPath, result);
  return result;
}

function printUsage() {
  console.log(
    'memory-precheck\n\nUsage:\n  node scripts/plan-conformance/memory-precheck.mjs [--changed <path>]... [--registry <path>] [--rules <path>] [--out <path>] [--limit <n>]'
  );
}

function createArgs() {
  return {
    changedFiles: [],
    registryPath: DEFAULT_REGISTRY_PATH,
    rulesPath: DEFAULT_RULES_PATH,
    outPath: DEFAULT_OUT_PATH,
    limit: DEFAULT_LIMIT,
    help: false,
  };
}

function consumeValue(args, token, next) {
  if (token === '--changed' && next) {
    args.changedFiles.push(next);
    return true;
  }

  if (token === '--registry' && next) {
    args.registryPath = next;
    return true;
  }

  if (token === '--rules' && next) {
    args.rulesPath = next;
    return true;
  }

  if (token === '--out' && next) {
    args.outPath = next;
    return true;
  }

  if (token === '--limit' && next) {
    args.limit = Number.parseInt(next, 10);
    return true;
  }

  return false;
}

function consumeFlag(args, token) {
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
    const result = runMemoryPrecheck(args);
    printSummary(result);
  } catch (error) {
    process.stdout.write(
      `[memory-precheck] advisory unavailable: ${error instanceof Error ? error.message : String(error)}\n`
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
