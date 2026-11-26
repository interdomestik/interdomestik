import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { runParallel } from '../contract-test-shards.mjs';
import { vitestProjects } from './coverage-lane.mjs';
import { checkExecution, nodeExecution, readExecution } from './execution.mjs';
import { advisoryStaffRlsLane, repoRoot, repositoryInventory } from './inventory.mjs';

const database = join(repoRoot, 'packages/database');
const inventory = repositoryInventory();
const filesIn = lane => inventory.filter(row => row.lanes.includes(lane)).map(row => row.file);
const integrationFlags = {
  'packages/domain-claims': { MESSAGE_RLS_INTEGRATION: '1' },
  'packages/domain-membership-billing': { BILLING_RLS_INTEGRATION: '1', RUN_DUNNING_POSTGRES: '1' },
};
const pilotContractFiles = new Set([
  'apps/web/src/actions/leads/pilot-lead-sales.cash.contract.test.ts',
  'apps/web/src/actions/leads/pilot-lead-sales.contract.test.ts',
  'apps/web/src/actions/pilot-billing-test.contract.test.ts',
  'apps/web/src/actions/public-intake.contract.test.ts',
  'apps/web/src/features/sponsors/pilot-sponsor-sales.contract.test.ts',
  'apps/web/src/lib/actions/agent-import-sales.contract.test.ts',
  'apps/web/src/lib/auth/pilot-identity.contract.test.ts',
  'apps/web/src/lib/auth/pilot-identity.races.contract.test.ts',
]);

function record(lane, files, report, started) {
  const errors = checkExecution(files, report);
  console.log(JSON.stringify({ lane, elapsedMs: Date.now() - started, ...report, errors }));
  if (errors.length) process.exitCode = 1;
}

async function runNode(lane, cwd = database) {
  const files = filesIn(lane);
  const started = Date.now();
  const loader = createRequire(join(cwd, 'package.json')).resolve('tsx');
  process.chdir(cwd);
  record(lane, files, await nodeExecution(repoRoot, files, ['--import', loader]), started);
}

async function runAdvisoryTooling() {
  const contracts = new Set(filesIn('advisory/contracts'));
  if (contracts.size) {
    const select = files => files.filter(file => contracts.has(file));
    const testArgs = [
      '--test-reporter=spec',
      '--test-reporter-destination=stdout',
      `--test-reporter=${join(import.meta.dirname, 'contract-reporter.mjs')}`,
      '--test-reporter-destination=stderr',
    ];
    if ((await runParallel({ root: repoRoot, select, testArgs })) !== 0) process.exitCode = 1;
  }
  if (filesIn('advisory/release-gate').length) {
    await runNode('advisory/release-gate', repoRoot);
  }
}

function runVitest(lane, batches) {
  const files = filesIn(lane);
  const started = Date.now();
  const report = { complete: batches.length > 0, files: [] };
  const temp = mkdtempSync(join(tmpdir(), 'db-lanes-vitest-'));
  try {
    for (const [index, { project, selected, options = [], fixtureEnv = {} }] of batches.entries()) {
      if (!fixtureEnv) {
        report.complete = false;
        continue;
      }
      const filename = join(temp, `${index}.json`);
      const cwd = join(repoRoot, project);
      const result = spawnSync(
        'pnpm',
        [
          'exec',
          'vitest',
          'run',
          '--no-file-parallelism',
          '--retry=0',
          ...options,
          '--reporter',
          join(import.meta.dirname, 'vitest-reporter.mjs'),
          ...selected.map(file => relative(cwd, join(repoRoot, file))),
        ],
        {
          cwd,
          stdio: 'ignore',
          env: {
            ...process.env,
            ...integrationFlags[project],
            ...fixtureEnv,
            DB_LANES_ROOT: repoRoot,
            DB_LANES_REPORT: filename,
          },
        }
      );
      try {
        const group = readExecution(filename);
        report.complete &&= result.status === 0 && group.complete;
        report.files.push(...group.files);
      } catch (error) {
        console.error(`${project}: ${error.message}`);
        report.complete = false;
      }
    }
  } finally {
    rmSync(temp, { force: true, recursive: true });
  }
  record(lane, files, report, started);
}

async function provisionRuntimeUrl(adminUrl) {
  const { describeRuntimeRoleFailure, provisionE2eRuntimeRole } =
    await import('../../e2e-runtime-role.mjs');
  try {
    return await provisionE2eRuntimeRole({ adminUrl });
  } catch (error) {
    console.error(`Advisory restricted role setup failed: ${describeRuntimeRoleFailure(error)}`);
    return null;
  }
}

async function runPg16Vitest(adminUrl) {
  const lane = 'advisory/vitest-pg16';
  const files = filesIn(lane);
  const ordinary = files.filter(file => !pilotContractFiles.has(file));
  const pilot = files.filter(file => pilotContractFiles.has(file));
  const staff = filesIn(advisoryStaffRlsLane);
  const runtimeUrl = pilot.length || staff.length ? await provisionRuntimeUrl(adminUrl) : null;
  const batches = Array.from(vitestProjects(ordinary), ([project, selected]) => ({
    project,
    selected,
  }));
  if (pilot.length) {
    batches.push({
      project: 'apps/web',
      selected: pilot,
      fixtureEnv: runtimeUrl && {
        DATABASE_URL_RLS: runtimeUrl,
        BETTER_AUTH_CONTRACT_DATABASE_URL: adminUrl,
        DIFFERENT_EMAIL_RECOVERY_DATABASE_URL: adminUrl,
        REQUIRE_PILOT_SALES_CONTRACT: '1',
        PILOT_SALES_CONTRACT_DATABASE_URL: adminUrl,
        PILOT_SALES_CONTRACT_DATABASE_URL_RLS: runtimeUrl,
        REQUIRE_PUBLIC_INTAKE_CONTRACT: '1',
        PILOT_INTAKE_CONTRACT_DATABASE_URL: adminUrl,
        PILOT_INTAKE_CONTRACT_DATABASE_URL_RLS: runtimeUrl,
        REQUIRE_PILOT_IDENTITY_CONTRACT: '1',
      },
    });
  }
  runVitest(lane, batches);
  if (staff.length === 0) return;
  const staffBatch = {
    project: 'apps/web',
    selected: staff,
    options: ['--environment=node', '--maxWorkers=1', '--testTimeout=30000'],
    fixtureEnv: runtimeUrl && {
      E2E_DATABASE_URL: adminUrl,
      DATABASE_URL_RLS: runtimeUrl,
      DB_MAX_CONNECTIONS: '1',
      S8_STAFF_DETAIL_DB_PROOF: '1',
      S8_STAFF_DETAIL_RUN_TOKEN: randomBytes(8).toString('hex'),
    },
  };
  runVitest(advisoryStaffRlsLane, [staffBatch]);
}

if (process.argv[2] === 'unit') {
  for (const key of Object.keys(process.env)) {
    if (key.includes('DATABASE_URL') || /^(?:PG|DB_)/u.test(key)) delete process.env[key];
  }
  await runNode('advisory/node-unit');
  await runAdvisoryTooling();
} else if (process.argv[2] === 'pg16') {
  // These fixtures include writers. Use only the disposable CI service.
  if (
    process.env.CI !== 'true' ||
    process.env.DATABASE_URL !==
      'postgresql://postgres:postgres@127.0.0.1:5432/interdomestik_test' ||
    process.env.DATABASE_URL_RLS ||
    process.env.E2E_DATABASE_URL ||
    process.env.E2E_SERVER_DATABASE_URL_RLS
  ) {
    throw new Error(
      'Database lane requires the disposable CI service and its fixture configuration'
    );
  }
  process.env.REQUIRE_RLS_INTEGRATION = '1';
  process.env.REQUIRE_RLS_COVERAGE = '1';
  process.env.REQUIRE_DOMAIN_EVENT_RELAY_SQL_PROOF = '1';
  await runNode('advisory/node-pg16');
  await runPg16Vitest(process.env.DATABASE_URL);
} else {
  throw new Error('Expected database lane mode: unit or pg16');
}
