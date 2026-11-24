import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';

// Inventory the explicit database commands without executing or rewriting them.
export function protectedLanes(root) {
  const read = file => readFileSync(join(root, file), 'utf8');
  const scripts = (directory = '.') => JSON.parse(read(`${directory}/package.json`)).scripts;
  const workflow = yaml.load(read('.github/workflows/ci.yml'));
  const roots = scripts();
  const e2e = workflow.jobs['e2e-gate'];
  const rls = e2e.steps.find(step => step.name === 'RLS Integration Test');
  const prepare = e2e.steps.find(step => step.name === 'Prepare E2E Database');
  if (
    e2e.if !== "needs.validation-surface.outputs.run_broad == 'true'" ||
    rls?.run !== 'pnpm db:rls:test' ||
    rls.if ||
    rls.env?.REQUIRE_RLS_INTEGRATION !== '1' ||
    rls.env?.REQUIRE_RLS_COVERAGE !== '1' ||
    prepare?.if ||
    !prepare?.run?.trimEnd().endsWith('\npnpm db:journal:parity') ||
    prepare.env?.REQUIRE_JOURNAL_SCHEMA_PARITY !== '1'
  ) {
    throw new Error('Cannot inventory the existing PG16 workflow selectors');
  }

  function packageTargets(command) {
    const invocation = /^pnpm --filter @interdomestik\/([\w-]+) (test:[\w-]+)$/u.exec(command);
    if (!invocation) throw new Error('Unsupported PG16 package selector');
    const [, name, script] = invocation;
    const directory = `packages/${name}`;
    const run = scripts(directory)[script];
    if (!run) throw new Error(`Missing ${name} ${script} selector`);
    return run.split(' && ').flatMap(part => {
      const invocation =
        /^(?:(?:REQUIRE_DOMAIN_EVENT_RELAY_SQL_PROOF|REQUIRE_RLS_INTEGRATION|MESSAGE_RLS_INTEGRATION|BILLING_RLS_INTEGRATION)=1 )*(?:tsx --test(?: --test-concurrency=1)?|vitest run(?: --no-file-parallelism)?) (.+)$/u.exec(
          part
        );
      if (!invocation) throw new Error(`Unsupported runner in ${name} ${script}`);
      const files = invocation[1].split(' ');
      if (
        !files.length ||
        files.some(file => !/^(?:src|test)\/[\w./-]+\.test\.tsx?$/u.test(file))
      ) {
        throw new Error(`Unsupported file selector in ${name} ${script}`);
      }
      return files.map(file => `${directory}/${file}`);
    });
  }

  function webTargets(command) {
    if (command !== 'node scripts/run-staff-detail-rls.mjs') {
      throw new Error('Unsupported staff detail selector');
    }
    const source = read('scripts/run-staff-detail-rls.mjs');
    const args = /const child = spawn\(\s*process\.execPath,\s*\[([\s\S]*?)\n\s*\],/u.exec(source);
    const prefix = [
      'vitest,',
      "'run',",
      "'--environment=node',",
      "'--maxWorkers=1',",
      "'--no-file-parallelism',",
      "'--testTimeout=30000',",
    ];
    const lines = (args?.[1] ?? '')
      .trim()
      .split('\n')
      .map(line => line.trim());
    const files = lines
      .slice(prefix.length)
      .map(line => /^'(src\/[^']+\.test\.tsx?)',$/u.exec(line));
    if (
      !prefix.every((line, index) => line === lines[index]) ||
      !files.length ||
      files.includes(null)
    ) {
      throw new Error('Unsupported staff detail test selectors');
    }
    return files.map(([, file]) => `apps/web/${file}`);
  }

  const coverage = workflow.jobs.unit.steps.find(step => step.name === 'Coverage Gate');
  if (
    coverage?.run !== 'pnpm coverage:gate' ||
    !roots['coverage:gate'].startsWith('pnpm test:coverage && ') ||
    !roots['test:coverage'].includes('--filter @interdomestik/web exec vitest run --coverage') ||
    !roots['test:coverage'].includes('--filter @interdomestik/domain-* test:unit --coverage') ||
    scripts('packages/domain-users')['test:unit'] !== 'vitest run'
  ) {
    throw new Error('Cannot inventory the existing coverage selectors');
  }

  return [
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
    {
      name: 'unit/coverage',
      files: [
        'apps/web/src/features/claims/tracking/server/trackingLifecycle.integration.test.ts',
        'packages/domain-users/src/admin/get-users.rls.test.ts',
      ],
    },
  ];
}
