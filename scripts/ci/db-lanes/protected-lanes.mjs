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

const packageInvocation = /^pnpm --filter @interdomestik\/([\w-]+) (test:[\w-]+)$/u;
const prepareCommand = [
  'pnpm db:migrate',
  'if [[ "${{ github.event_name }}" != "pull_request" ]]; then',
  '  pnpm seed:e2e',
  '  pnpm seed:assert-e2e',
  'fi',
  'pnpm db:journal:parity',
].join('\n');

class UnprovenSelector extends Error {}

function testArguments(part, name, script) {
  const args = part.split(' ');
  let runnerIndex = 0;
  while (requiredFlags.has(args[runnerIndex])) runnerIndex += 1;
  const command = args.slice(runnerIndex).join(' ');
  const prefix = runnerPrefixes.find(value => command.startsWith(value));
  if (!prefix) throw new UnprovenSelector(`Unsupported runner in ${name} ${script}`);
  const files = command.slice(prefix.length).split(' ');
  if (
    files.some(file => !/^(?:src|test)\/(?:[\w-][\w.-]*\/)*[\w-][\w.-]*\.test\.tsx?$/u.test(file))
  ) {
    throw new UnprovenSelector(`Unsupported file selector in ${name} ${script}`);
  }
  const messageProof =
    name === 'domain-claims' &&
    files.some(file => /^src\/claims\/message-integration\/.+\.integration\.test\.ts$/u.test(file));
  if (messageProof && !args.slice(0, runnerIndex).includes('MESSAGE_RLS_INTEGRATION=1')) {
    throw new UnprovenSelector(`Missing MESSAGE_RLS_INTEGRATION=1 in ${name} ${script}`);
  }
  return files;
}

function pg16WorkflowSelectors(workflow, roots, packageTargets, webTargets, onUnproven) {
  const job = workflow.jobs?.['e2e-gate'];
  const step = name =>
    provenWorkflowStep(
      workflow,
      'e2e-gate',
      name,
      "needs.validation-surface.outputs.run_broad == 'true'"
    );
  const prepare = step('Prepare E2E Database');
  const rls = step('RLS Integration Test');
  const prepared =
    [job?.needs].flat().includes('validation-surface') &&
    typeof prepare?.run === 'string' &&
    prepare.run.trimEnd() === prepareCommand &&
    prepare.env?.REQUIRE_JOURNAL_SCHEMA_PARITY === '1';
  const rlsRequired = ['REQUIRE_RLS_INTEGRATION', 'REQUIRE_RLS_COVERAGE'].every(
    key => rls?.env?.[key] === '1'
  );
  const selectors = [
    [
      'e2e-gate/RLS',
      () => {
        if (!prepared) throw new UnprovenSelector('Cannot prove the Prepare E2E Database step');
        if (
          rls?.run !== 'pnpm db:rls:test' ||
          !rlsRequired ||
          job.steps.indexOf(rls) <= job.steps.indexOf(prepare)
        ) {
          throw new UnprovenSelector('Cannot prove the RLS Integration Test step');
        }
        const run = roots?.['db:rls:test'];
        if (typeof run !== 'string') throw new UnprovenSelector('Missing db:rls:test selector');
        return run
          .split(' && ')
          .flatMap(command =>
            command === 'pnpm db:rls:test:staff-detail'
              ? webTargets(roots['db:rls:test:staff-detail'])
              : packageTargets(command)
          );
      },
    ],
    [
      'e2e-gate/journal-parity',
      () => {
        if (!prepared) throw new UnprovenSelector('Cannot prove the Prepare E2E Database step');
        return packageTargets(roots?.['db:journal:parity']);
      },
    ],
  ];
  return selectors.flatMap(([name, select]) => {
    try {
      return [{ name, files: select() }];
    } catch (error) {
      if (!(error instanceof UnprovenSelector) || !onUnproven) throw error;
      onUnproven(name, error);
      return [];
    }
  });
}

// Inventory the existing runners without executing or rewriting them.
export function protectedLanes(root, coverageCandidates = [], databaseFiles = [], onUnproven) {
  const read = file => readFileSync(join(root, file), 'utf8');
  const manifest = (directory = '.') => JSON.parse(read(`${directory}/package.json`));
  const workflow = yaml.load(read('.github/workflows/ci.yml')) ?? {};
  const roots = manifest()?.scripts ?? {};

  function packageTargets(command, ancestors = []) {
    const invocation = packageInvocation.exec(command);
    if (!invocation) throw new UnprovenSelector('Unsupported PG16 package selector');
    const [, name, script] = invocation;
    const selector = `${name} ${script}`;
    if (ancestors.includes(selector)) {
      throw new UnprovenSelector(
        `Recursive package selector: ${[...ancestors, selector].join(' -> ')}`
      );
    }
    const directory = `packages/${name}`;
    let pkg;
    try {
      pkg = manifest(directory);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      throw new UnprovenSelector(`Missing package manifest for ${selector}`);
    }
    const run = pkg?.scripts?.[script];
    if (pkg?.name !== `@interdomestik/${name}` || typeof run !== 'string' || !run.trim()) {
      throw new UnprovenSelector(`Missing ${selector} selector`);
    }
    return run
      .split(' && ')
      .flatMap(part =>
        packageInvocation.test(part)
          ? packageTargets(part, [...ancestors, selector])
          : testArguments(part, name, script).map(file => `${directory}/${file}`)
      );
  }

  function webTargets(command) {
    if (command !== 'node scripts/run-staff-detail-rls.mjs') {
      throw new UnprovenSelector('Unsupported staff detail selector');
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
      throw new UnprovenSelector('Unsupported staff detail test selectors');
    }
    return lines.slice(firstFile, end).map(line => {
      const match = /^'(src\/[^']+\.test\.tsx?)',$/u.exec(line);
      if (!match) throw new UnprovenSelector('Unsupported staff detail test selector');
      return `apps/web/${match[1]}`;
    });
  }

  const lanes = pg16WorkflowSelectors(workflow, roots, packageTargets, webTargets, onUnproven);
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
