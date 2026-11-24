import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { productContractSelector } from '../contract-suite-run.mjs';
import { contractTestPlan } from '../contract-test-shards.mjs';
import { coverageTargets } from './coverage-lane.mjs';
import { provenWorkflowStep } from './workflow-selectors.mjs';

export const isContractTest = file => /^scripts\/ci\/(?!\.)[^/]+\.test\.mjs$/u.test(file);
export const isReleaseGateTest = file => /^scripts\/release-gate\/[\w.-]+\.test\.ts$/u.test(file);

const requiredFlags = new Set([
  'REQUIRE_DOMAIN_EVENT_RELAY_SQL_PROOF=1',
  'REQUIRE_RLS_INTEGRATION=1',
  'MESSAGE_RLS_INTEGRATION=1',
  'BILLING_RLS_INTEGRATION=1',
]);
const runnerPrefixes = [
  'tsx --test --test-concurrency=1 ',
  'tsx --test ',
  'vitest run --no-file-parallelism ',
  'vitest run ',
];

function checkPg16Workflow(e2e) {
  const rls = e2e.steps.find(step => step.name === 'RLS Integration Test');
  const prepare = e2e.steps.find(step => step.name === 'Prepare E2E Database');
  const rlsFlags = rls?.env;
  const rlsRequired = ['REQUIRE_RLS_INTEGRATION', 'REQUIRE_RLS_COVERAGE'].every(
    key => rlsFlags?.[key] === '1'
  );
  const journalLast = prepare?.run?.trimEnd().endsWith('\npnpm db:journal:parity');
  const journalRequired = prepare?.env?.REQUIRE_JOURNAL_SCHEMA_PARITY === '1';
  const checks = [
    e2e.if === "needs.validation-surface.outputs.run_broad == 'true'",
    rls?.run === 'pnpm db:rls:test',
    !rls?.if,
    rlsRequired,
    !prepare?.if,
    journalLast,
    journalRequired,
  ];
  if (!checks.every(Boolean))
    throw new Error('Cannot inventory the existing PG16 workflow selectors');
}

function testArguments(part, name, script) {
  const args = part.split(' ');
  let runnerIndex = 0;
  while (requiredFlags.has(args[runnerIndex])) runnerIndex += 1;
  const command = args.slice(runnerIndex).join(' ');
  const prefix = runnerPrefixes.find(value => command.startsWith(value));
  if (!prefix) throw new Error(`Unsupported runner in ${name} ${script}`);
  const files = command.slice(prefix.length).split(' ');
  if (files.some(file => !/^(?:src|test)\/[\w./-]+\.test\.tsx?$/u.test(file))) {
    throw new Error(`Unsupported file selector in ${name} ${script}`);
  }
  return files;
}

// Inventory the existing runners without executing or rewriting them.
export function protectedLanes(root, coverageCandidates = [], databaseFiles = []) {
  const read = file => readFileSync(join(root, file), 'utf8');
  const scripts = (directory = '.') => JSON.parse(read(`${directory}/package.json`)).scripts;
  const workflow = yaml.load(read('.github/workflows/ci.yml'));
  const roots = scripts();
  checkPg16Workflow(workflow.jobs['e2e-gate']);

  function packageTargets(command) {
    const invocation = /^pnpm --filter @interdomestik\/([\w-]+) (test:[\w-]+)$/u.exec(command);
    if (!invocation) throw new Error('Unsupported PG16 package selector');
    const [, name, script] = invocation;
    const directory = `packages/${name}`;
    const run = scripts(directory)[script];
    if (!run) throw new Error(`Missing ${name} ${script} selector`);
    return run
      .split(' && ')
      .flatMap(part => testArguments(part, name, script).map(file => `${directory}/${file}`));
  }

  function webTargets(command) {
    if (command !== 'node scripts/run-staff-detail-rls.mjs') {
      throw new Error('Unsupported staff detail selector');
    }
    const lines = read('scripts/run-staff-detail-rls.mjs')
      .split('\n')
      .map(line => line.trim());
    const start = lines.indexOf('const child = spawn(');
    const prefix = [
      'const child = spawn(',
      'process.execPath,',
      '[',
      'vitest,',
      "'run',",
      "'--environment=node',",
      "'--maxWorkers=1',",
      "'--no-file-parallelism',",
      "'--testTimeout=30000',",
    ];
    const firstFile = start + prefix.length;
    const end = lines.indexOf('],', firstFile);
    if (
      start < 0 ||
      end <= firstFile ||
      !prefix.every((line, index) => line === lines[start + index])
    ) {
      throw new Error('Unsupported staff detail test selectors');
    }
    return lines.slice(firstFile, end).map(line => {
      const match = /^'(src\/[^']+\.test\.tsx?)',$/u.exec(line);
      if (!match) throw new Error('Unsupported staff detail test selector');
      return `apps/web/${match[1]}`;
    });
  }

  const lanes = [
    {
      name: 'e2e-gate/RLS',
      files: roots['db:rls:test']
        .split(' && ')
        .flatMap(command =>
          command === 'pnpm db:rls:test:staff-detail'
            ? webTargets(roots['db:rls:test:staff-detail'])
            : packageTargets(command)
        ),
    },
    { name: 'e2e-gate/journal-parity', files: packageTargets(roots['db:journal:parity']) },
  ];
  const coverage = coverageTargets(root, workflow, roots, read, coverageCandidates);
  if (coverage.length) lanes.push({ name: 'unit/coverage', files: coverage });

  const contractCandidates = databaseFiles.filter(isContractTest);
  const audit = provenWorkflowStep(workflow, 'audit', 'Run Audits');
  const firstCommand = audit?.run
    ?.split('\n')
    .map(line => line.trim())
    .find(line => line && !line.startsWith('#'));
  if (contractCandidates.length && firstCommand === 'node scripts/ci/contract-suite-run.mjs') {
    const { shards } = contractTestPlan(root);
    const selected = new Set(productContractSelector(root)(Object.values(shards).flat()));
    const files = contractCandidates.filter(file => selected.has(file));
    if (files.length) lanes.push({ name: 'audit/contracts', files });
  }

  const release = provenWorkflowStep(workflow, 'unit', 'Release Gate Unit Tests');
  const releaseCommand = roots['test:release-gate'];
  if (
    release?.run === 'pnpm test:release-gate' &&
    /^tsx --test(?: scripts\/release-gate\/[\w.-]+\.test\.ts)+$/u.test(releaseCommand)
  ) {
    const selected = new Set(releaseCommand.split(' ').slice(2));
    const files = databaseFiles.filter(file => selected.has(file));
    if (files.length) lanes.push({ name: 'unit/release-gate', files });
  }
  return lanes;
}
