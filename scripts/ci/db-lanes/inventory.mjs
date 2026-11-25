import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RETIRED_LEGACY_FILES } from '../contract-test-shards.mjs';
import { compareCodeUnits } from '../db-access-order.mjs';
import { listVitestFiles, vitestProjects } from './coverage-lane.mjs';
import { isContractTest, isReleaseGateTest, protectedLanes } from './protected-lanes.mjs';

export const repoRoot = resolve(import.meta.dirname, '../../..');
const testFile = /\.(?:test|spec)\.[cm]?[jt]sx?$/u;
const databaseMarker = /(?:^|[.-])(?:db|pg16|postgres|integration|rls|restricted-role)/u;
const marked = new RegExp(`${databaseMarker.source}[.-]`, 'u');
const liveTestSuffix = new RegExp(String.raw`${databaseMarker.source}\.test\.ts$`, 'u');
const correspondenceProof = /^claim-correspondence(?:-.+)?\.test\.ts$/u;
const rlsMarked = /(?:^|[.-])(?:rls|restricted-role)[.-]/u;
const sourceTree = /^(?:apps\/web|packages\/[^/]+)\/src\//u;
const authContracts = /^apps\/web\/src\/lib\/auth\/[^/]+\.contract\./u;
const packageTests = /^packages\/[^/]+\/test\//u;
const databaseSignals = [
  /DATABASE_URL|DB_PROOF|DB_INTEGRATION|POSTGRES_URL|POSTGRES_INTEGRATION|RLS_INTEGRATION|RUN_DUNNING_POSTGRES/u,
  /node:process|restricted-role|db-client|@interdomestik\/database\b/u,
  /['"](?:pg|postgres)['"]/u,
];

function isDatabaseTest(root, file) {
  const name = basename(file);
  if (name.endsWith('rls.spec.ts')) return true;
  if (packageTests.test(file) || rlsMarked.test(name)) return true;
  if (sourceTree.test(file) && (marked.test(name) || authContracts.test(file))) return true;
  const source = readFileSync(join(root, file), 'utf8');
  return (
    databaseSignals.some(signal => signal.test(source)) ||
    (/\bprocess\b/u.test(source) && /\benv\b/u.test(source))
  );
}

export function trackedTests(root, excludedFiles = new Set()) {
  const output = execFileSync('git', ['ls-files', '--cached', '--deduplicate', '-z'], {
    cwd: root,
    encoding: 'utf8',
  });
  return output
    .split('\0')
    .filter(file => testFile.test(file))
    .filter(file => excludedFiles.has(file) || isDatabaseTest(root, file))
    .sort(compareCodeUnits);
}

function isExactTestPath(file) {
  return (
    testFile.test(file) &&
    !/[*?\\\r\n\0]/u.test(file) &&
    file.split('/').every(segment => !['', '.', '..'].includes(segment))
  );
}

export function readExclusions(filename) {
  let source;
  try {
    source = readFileSync(filename, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error('Database test exclusions manifest is missing');
    throw error;
  }
  if (!source.trim()) throw new Error('Database test exclusions manifest is empty');
  let entries;
  try {
    entries = JSON.parse(source);
  } catch {
    throw new Error('Database test exclusions manifest has invalid JSON');
  }
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error('Database test exclusions manifest must have at least one exclusion');
  }
  const seen = new Set();
  for (const entry of entries) {
    const complete = ['file', 'reason', 'owner', 'removeWhen'].every(
      key => typeof entry?.[key] === 'string' && entry[key].trim()
    );
    if (!complete || !isExactTestPath(entry.file)) {
      throw new Error('Database test exclusions manifest has an invalid exclusion');
    }
    if (seen.has(entry.file)) throw new Error(`duplicate exclusion: ${entry.file}`);
    seen.add(entry.file);
  }
  return entries;
}

function advisoryNodeLane(file) {
  if (isContractTest(file) && !RETIRED_LEGACY_FILES.includes(file)) return 'advisory/contracts';
  if (isReleaseGateTest(file)) return 'advisory/release-gate';
  if (file === 'packages/domain-membership-billing/test/exchange-rates-port.test.ts') {
    return 'advisory/node-pg16';
  }
  if (/^packages\/database\/test\/(?:pg16\/)?[^/]+\.test\.ts$/u.test(file)) {
    const name = basename(file);
    if (
      file.startsWith('packages/database/test/pg16/') ||
      liveTestSuffix.test(name) ||
      correspondenceProof.test(name)
    ) {
      return 'advisory/node-pg16';
    }
    return name.startsWith('sponsor-') && name !== 'sponsor-refactor.test.ts'
      ? 'advisory/node-pg16'
      : 'advisory/node-unit';
  }
  return undefined;
}

function isVitestCandidate(file) {
  return (
    /^apps\/web\/src\/.+\.test\.tsx?$/u.test(file) ||
    /^packages\/domain-[^/]+\/src\/.+\.test\.ts$/u.test(file)
  );
}

function recordExistingLanes(lanesByFile, existing) {
  for (const { name, files: selected } of existing) {
    if (selected.length === 0) throw new Error(`${name} has an empty selector`);
    for (const file of selected) {
      const lanes = lanesByFile.get(file);
      if (!lanes) throw new Error(`${name} selects an untracked test: ${file}`);
      if (!lanes.includes(name)) lanes.push(name);
    }
  }
}

export function buildInventory(files, existing, exclusions, advisoryVitest = new Set()) {
  const lanesByFile = new Map(files.map(file => [file, []]));
  const excluded = new Map(exclusions.map(entry => [entry.file, entry]));
  recordExistingLanes(lanesByFile, existing);
  for (const file of excluded.keys()) {
    if (!lanesByFile.has(file)) throw new Error(`exclusion is not a tracked test: ${file}`);
    if (lanesByFile.get(file).length) throw new Error(`excluded test is already selected: ${file}`);
  }
  const inventory = files.map(file => {
    const lanes = lanesByFile.get(file);
    if (excluded.has(file)) return { file, lanes, exclusion: excluded.get(file) };
    const advisory = advisoryVitest.has(file) ? 'advisory/vitest-pg16' : advisoryNodeLane(file);
    if (!lanes.length && advisory) lanes.push(advisory);
    return { file, lanes };
  });
  const orphans = inventory.filter(({ lanes, exclusion }) => !lanes.length && !exclusion);
  if (orphans.length) {
    throw new Error(`Database tests with no CI lane: ${orphans.map(row => row.file).join(', ')}`);
  }
  if (!inventory.length) throw new Error('Database test inventory is empty');
  return inventory;
}

export function repositoryInventory(root = repoRoot) {
  const exclusions = readExclusions(join(root, 'scripts/ci/db-lanes/exclusions.json'));
  const excludedFiles = new Set(exclusions.map(entry => entry.file));
  const files = trackedTests(root, excludedFiles);
  const candidates = files.filter(file => isVitestCandidate(file) && !excludedFiles.has(file));
  const existing = protectedLanes(root, candidates, files, (name, error) => {
    console.warn(`Database lane ${name}: ${error.message}; using advisory selectors.`);
  });
  const protectedFiles = new Set(existing.flatMap(lane => lane.files));
  const advisoryVitest = new Set();
  for (const [project, pending] of vitestProjects(
    candidates.filter(file => !protectedFiles.has(file))
  )) {
    const listed = listVitestFiles(root, project, pending, []);
    for (const file of pending) {
      if (listed.has(file)) advisoryVitest.add(file);
    }
  }
  return buildInventory(files, existing, exclusions, advisoryVitest);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(repositoryInventory(), null, 2));
}
