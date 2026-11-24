import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { protectedLanes } from './protected-lanes.mjs';

export const repoRoot = resolve(import.meta.dirname, '../../..');
const testFile = /\.(?:test|spec)\.[cm]?[jt]sx?$/u;
const marked = /[.-](?:db|pg16|postgres|integration|rls|restricted-role)[.-]/u;
const sourceTree = /^(?:apps\/web|packages\/[^/]+)\/src\//u;

function isDatabaseTest(file) {
  if (!testFile.test(file)) return false;
  const name = file.split('/').at(-1);
  return (
    /^packages\/[^/]+\/test\//u.test(file) ||
    /[.-](?:rls|restricted-role)[.-]/u.test(name) ||
    (sourceTree.test(file) && marked.test(name))
  );
}

export function trackedTests(root) {
  const output = execFileSync('git', ['ls-files', '--cached', '--deduplicate', '-z'], {
    cwd: root,
    encoding: 'utf8',
  });
  return output.split('\0').filter(isDatabaseTest).sort();
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
    if (
      !entry ||
      !['file', 'reason', 'owner', 'removeWhen'].every(
        key => typeof entry[key] === 'string' && entry[key].trim()
      ) ||
      !isDatabaseTest(entry.file) ||
      /[*?\\\r\n\0]/u.test(entry.file) ||
      entry.file.split('/').some(segment => ['', '.', '..'].includes(segment))
    ) {
      throw new Error('Database test exclusions manifest has an invalid exclusion');
    }
    if (seen.has(entry.file)) throw new Error(`duplicate exclusion: ${entry.file}`);
    seen.add(entry.file);
  }
  return entries;
}

function advisoryLane(file) {
  if (/^packages\/database\/test\/(?:pg16\/)?[^/]+\.test\.ts$/u.test(file)) {
    const name = file.split('/').at(-1);
    const liveTest = /[.-](?:db|pg16|postgres|integration|rls|restricted-role)\.test\.ts$/u;
    if (file.startsWith('packages/database/test/pg16/') || liveTest.test(name)) {
      return 'advisory/node-pg16';
    }
    return /^sponsor-(?!refactor\.test\.ts$)/u.test(name)
      ? 'advisory/node-pg16'
      : 'advisory/node-unit';
  }
  if (
    /^apps\/web\/src\/.+\.test\.tsx?$/u.test(file) ||
    /^packages\/domain-[^/]+\/src\/.+\.test\.ts$/u.test(file)
  ) {
    return 'advisory/vitest-pg16';
  }
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
  return buildInventory(
    trackedTests(root),
    protectedLanes(root),
    readExclusions(join(root, 'scripts/ci/db-lanes/exclusions.json'))
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(repositoryInventory(), null, 2));
}
