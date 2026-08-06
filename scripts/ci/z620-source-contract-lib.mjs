import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import yaml from 'js-yaml';
import { expectedGateCommandRecord } from './z620-gate-command-lib.mjs';
import { sortedGateStrings } from './z620-gate-command-policy.mjs';

const DEFAULT_ROOT = path.resolve(import.meta.dirname, '../..');
const TASK_DATABASE_TOKEN = '$TASK_DATABASE_URL';
const CI_UNIT = '.github/workflows/ci.yml#unit';
const E2E_RUNNER = '.github/workflows/e2e-pr.yml#e2e-runner';
const TASK_DATABASE_KEYS = ['E2E_DATABASE_URL', 'E2E_DATABASE_URL_RLS'];

const read = (root, relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

function namedStep(root, workflowPath, jobName, stepName) {
  const workflow = yaml.load(read(root, workflowPath));
  const matches = (workflow?.jobs?.[jobName]?.steps ?? []).filter(step => step?.name === stepName);
  if (matches.length !== 1)
    throw new Error(`${workflowPath}#${jobName}: missing named step ${stepName}`);
  return matches[0];
}

function argv(run, label) {
  if (
    typeof run !== 'string' ||
    !/^[A-Za-z0-9_@./:=+-]+(?: [A-Za-z0-9_@./:=+-]+)*$/u.test(run.trim())
  ) {
    throw new Error(`${label}: command must be one simple argv`);
  }
  return run.trim().split(/\s+/u);
}

function normalizedEnv(environment, label) {
  if (!environment || typeof environment !== 'object' || Array.isArray(environment)) {
    throw new Error(`${label}: env must be an object`);
  }
  return Object.fromEntries(
    Object.entries(environment)
      .map(([key, value]) => {
        if (typeof value !== 'string') throw new Error(`${label}: env values must be strings`);
        return [key, value === '${{ env.DATABASE_URL }}' ? TASK_DATABASE_TOKEN : value];
      })
      .sort(([left], [right]) => left.localeCompare(right))
  );
}

function smokeProjects(root) {
  const packageJson = JSON.parse(read(root, 'apps/web/package.json'));
  const script = packageJson?.scripts?.['e2e:smoke'];
  if (typeof script !== 'string') throw new Error('e2e-smoke: package script missing');
  const projects = [...script.matchAll(/(?:^|\s)--project=([A-Za-z0-9-]+)/gu)].map(
    match => match[1]
  );
  if (projects.length === 0) throw new Error('e2e-smoke: package projects missing');
  return sortedGateStrings(new Set(projects));
}

export function deriveTaskDatabaseEnv(root = DEFAULT_ROOT) {
  const source = read(root, 'scripts/ci/z620-resource-run.mjs');
  for (const key of TASK_DATABASE_KEYS) {
    if (!source.includes(`${key}: databaseConnection,`)) {
      throw new Error(`${key}: resource runner must use the task database connection`);
    }
  }
  return Object.fromEntries(TASK_DATABASE_KEYS.map(key => [key, TASK_DATABASE_TOKEN]));
}

function prLaneAuthority(root) {
  const source = read(root, 'scripts/run-e2e-lane.mjs');
  const bindings = new Map(
    [...source.matchAll(/const ([A-Za-z][A-Za-z0-9]*) = '--project=([^']+)';/gu)].map(match => [
      match[1],
      match[2],
    ])
  );
  const pr = source.match(/\n\s*pr:\s*gateLane\(\[([^\]]+)\],\s*true\)/u);
  const setup = source.match(
    /const setupArgs = \[\s*'([^']+)',\s*'--project=([^']+)',\s*'--project=([^']+)'\s*\];/u
  );
  const gate = source.match(/const gateArgs = \[\s*'([^']+)',/u);
  if (!pr || !setup || !gate) throw new Error('e2e-gate-pr: lane authority is malformed');
  const laneProjects = pr[1]
    .split(',')
    .map(value => value.trim())
    .map(name => bindings.get(name));
  if (laneProjects.some(value => !value)) throw new Error('e2e-gate-pr: unknown project binding');
  return {
    projects: sortedGateStrings(new Set([...laneProjects, setup[2], setup[3]])),
    specs: sortedGateStrings([gate[1], setup[1]]),
  };
}

function workflowRecord(root, jobKey, stepName, commandId, projects, specs) {
  const [workflowPath, job] = jobKey.split('#');
  const step = namedStep(root, workflowPath, job, stepName);
  return {
    commandId,
    argv: argv(step.run, commandId),
    env: normalizedEnv(step.env ?? {}, commandId),
    projects,
    specs,
  };
}

export function deriveSourceCommandRecords(root = DEFAULT_ROOT) {
  const pr = prLaneAuthority(root);
  deriveTaskDatabaseEnv(root);
  return {
    [CI_UNIT]: [workflowRecord(root, CI_UNIT, 'Coverage Gate', 'coverage-gate', [], [])],
    [E2E_RUNNER]: [
      workflowRecord(root, E2E_RUNNER, 'Run PR E2E Gate', 'e2e-gate-pr', pr.projects, pr.specs),
      workflowRecord(root, E2E_RUNNER, 'Run PR Smoke E2E', 'e2e-smoke', smokeProjects(root), []),
    ],
  };
}

export function validateSourceCommandRecords(root = DEFAULT_ROOT, gates) {
  let sourceRecords;
  try {
    sourceRecords = deriveSourceCommandRecords(root);
  } catch (error) {
    return [`Source-derived command contract invalid: ${error.message}`];
  }
  const problems = [];
  for (const [job, records] of Object.entries(sourceRecords)) {
    for (const sourceRecord of records) {
      const metadata = gates.commandMetadata?.[sourceRecord.commandId];
      if (!metadata) {
        problems.push(`${sourceRecord.commandId}: source-derived command metadata missing`);
        continue;
      }
      const expected = expectedGateCommandRecord(sourceRecord.commandId, metadata);
      if (!isDeepStrictEqual(sourceRecord, expected)) {
        problems.push(`${sourceRecord.commandId}: source-derived command record mismatch`);
      }
      const checked = gates.jobCommands?.[job]?.find(
        record => record?.commandId === sourceRecord.commandId
      );
      if (!isDeepStrictEqual(checked, sourceRecord)) {
        problems.push(`${sourceRecord.commandId}: checked-in command record mismatch`);
      }
    }
  }
  return problems;
}
