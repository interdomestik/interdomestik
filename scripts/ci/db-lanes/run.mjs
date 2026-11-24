import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { checkExecution, nodeExecution, readExecution } from './execution.mjs';
import { repoRoot, repositoryInventory } from './inventory.mjs';

const database = join(repoRoot, 'packages/database');
const inventory = repositoryInventory();
const filesIn = lane => inventory.filter(row => row.lanes.includes(lane)).map(row => row.file);
const integrationFlags = {
  'packages/domain-communications': { MESSAGE_RLS_INTEGRATION: '1' },
  'packages/domain-membership-billing': { BILLING_RLS_INTEGRATION: '1', RUN_DUNNING_POSTGRES: '1' },
};

function record(lane, files, report, started) {
  const errors = checkExecution(files, report);
  console.log(JSON.stringify({ lane, elapsedMs: Date.now() - started, ...report, errors }));
  if (errors.length) process.exitCode = 1;
}

async function runNode(lane) {
  const files = filesIn(lane);
  const started = Date.now();
  const loader = createRequire(join(database, 'package.json')).resolve('tsx');
  process.chdir(database);
  record(lane, files, await nodeExecution(repoRoot, files, ['--import', loader]), started);
}

function runVitest() {
  const lane = 'advisory/vitest-pg16';
  const files = filesIn(lane);
  const started = Date.now();
  const groups = Map.groupBy(files, file => file.split('/').slice(0, 2).join('/'));
  const report = { complete: groups.size > 0, files: [] };
  const temp = mkdtempSync(join(tmpdir(), 'db-lanes-vitest-'));
  try {
    let index = 0;
    for (const [project, selected] of groups) {
      const filename = join(temp, `${index++}.json`);
      const cwd = join(repoRoot, project);
      const result = spawnSync(
        'pnpm',
        [
          'exec',
          'vitest',
          'run',
          '--environment=node',
          '--no-file-parallelism',
          '--retry=0',
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

if (process.argv[2] === 'unit') {
  for (const key of Object.keys(process.env)) {
    if (/DATABASE_URL|^PG|^DB_/u.test(key)) delete process.env[key];
  }
  await runNode('advisory/node-unit');
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
  await runNode('advisory/node-pg16');
  runVitest();
} else {
  throw new Error('Expected database lane mode: unit or pg16');
}
