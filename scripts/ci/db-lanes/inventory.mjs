import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { protectedLanes } from './protected-lanes.mjs';

export const repoRoot = resolve(import.meta.dirname, '../../..');
const testFile = /\.(?:test|spec)\.[cm]?[jt]sx?$/u;
const databaseMarker = /(?:^|[.-])(?:db|pg16|postgres|integration|rls|restricted-role)/u;
const marked = new RegExp(`${databaseMarker.source}[.-]`, 'u');
const liveTestSuffix = new RegExp(`${databaseMarker.source}\\.test\\.ts$`, 'u');
const rlsMarked = /(?:^|[.-])(?:rls|restricted-role)[.-]/u;
const sourceTree = /^(?:apps\/web|packages\/[^/]+)\/src\//u;
const authContracts = /^apps\/web\/src\/lib\/auth\/[^/]+\.contract\./u;
const packageTests = /^packages\/[^/]+\/test\//u;
const coverageMock = /\bvi\.mock\(\s*['"]@interdomestik\/database['"]/u;
const conditionalTest = /\.(?:runIf|skipIf|skip|todo)\b|\bskip\s*:/u;

function isLiveOptIn(file, source) {
  if (!conditionalTest.test(source)) return false;
  if (!source.includes('process.env')) return false;
  const syntax = ts.createSourceFile(file, source, ts.ScriptTarget.Latest);
  const databaseKey = /DATABASE_URL|DB_PROOF|DB_INTEGRATION|POSTGRES_INTEGRATION|RLS_INTEGRATION/u;
  function visitsDatabaseEnv(node) {
    const readsDatabaseEnv =
      ts.isPropertyAccessExpression(node) &&
      databaseKey.test(node.name.text) &&
      node.expression.getText(syntax) === 'process.env';
    return readsDatabaseEnv || Boolean(ts.forEachChild(node, visitsDatabaseEnv));
  }
  return visitsDatabaseEnv(syntax);
}

function isDatabaseTest(root, file) {
  const name = basename(file);
  if (name.endsWith('rls.spec.ts')) return true;
  if (packageTests.test(file) || rlsMarked.test(name)) return true;
  const inSource = sourceTree.test(file);
  if (!inSource && !file.startsWith('scripts/')) return false;
  if (inSource && (marked.test(name) || authContracts.test(file))) return true;
  return isLiveOptIn(file, readFileSync(join(root, file), 'utf8'));
}

export function trackedTests(root) {
  const output = execFileSync('git', ['ls-files', '--cached', '--deduplicate', '-z'], {
    cwd: root,
    encoding: 'utf8',
  });
  return output
    .split('\0')
    .filter(file => testFile.test(file))
    .filter(file => isDatabaseTest(root, file))
    .sort();
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

function advisoryLane(file) {
  if (/^packages\/database\/test\/(?:pg16\/)?[^/]+\.test\.ts$/u.test(file)) {
    const name = basename(file);
    if (file.startsWith('packages/database/test/pg16/') || liveTestSuffix.test(name)) {
      return 'advisory/node-pg16';
    }
    return name.startsWith('sponsor-') && name !== 'sponsor-refactor.test.ts'
      ? 'advisory/node-pg16'
      : 'advisory/node-unit';
  }
  if (
    /^apps\/web\/src\/.+\.test\.tsx?$/u.test(file) ||
    /^packages\/domain-[^/]+\/src\/.+\.test\.ts$/u.test(file)
  ) {
    return 'advisory/vitest-pg16';
  }
  return undefined;
}

export function buildInventory(files, existing, exclusions) {
  const lanesByFile = new Map(files.map(file => [file, []]));
  const excluded = new Map(exclusions.map(entry => [entry.file, entry]));
  for (const { name, files: selected } of existing) {
    if (selected.length === 0) throw new Error(`${name} has an empty selector`);
    for (const file of selected) {
      const lanes = lanesByFile.get(file);
      if (!lanes) throw new Error(`${name} selects an untracked test: ${file}`);
      if (!lanes.includes(name)) lanes.push(name);
    }
  }
  for (const file of excluded.keys()) {
    if (!lanesByFile.has(file)) throw new Error(`exclusion is not a tracked test: ${file}`);
    if (lanesByFile.get(file).length) throw new Error(`excluded test is already selected: ${file}`);
  }
  const inventory = files.map(file => {
    const lanes = lanesByFile.get(file);
    if (excluded.has(file)) return { file, lanes, exclusion: excluded.get(file) };
    const advisory = advisoryLane(file);
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
  const files = trackedTests(root);
  const exclusions = readExclusions(join(root, 'scripts/ci/db-lanes/exclusions.json'));
  const excludedFiles = new Set(exclusions.map(entry => entry.file));
  const coverageCandidates = files.filter(file => {
    if (advisoryLane(file) !== 'advisory/vitest-pg16' || excludedFiles.has(file)) return false;
    const source = readFileSync(join(root, file), 'utf8');
    return coverageMock.test(source) && !conditionalTest.test(source);
  });
  return buildInventory(files, protectedLanes(root, coverageCandidates), exclusions);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(repositoryInventory(), null, 2));
}
