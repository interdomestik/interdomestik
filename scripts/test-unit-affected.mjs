import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { buildUnitPlan } from './affected-unit-plan.mjs';

export function runSelectedUnits(plan, { refresh, run = spawnSync } = {}) {
  const assertCurrent = () => {
    if (refresh().identity !== plan.identity)
      throw new Error('Inputs changed; discard this feedback and select again');
  };
  assertCurrent();
  for (const name of plan.selected) {
    assertCurrent();
    const result = run('pnpm', ['--filter', name, 'run', 'test:unit'], {
      cwd: plan.root,
      stdio: 'inherit',
      env: process.env,
    });
    if (result.error) throw result.error;
    if (result.signal || result.status !== 0) {
      throw new Error(`Unit task ${name} failed (${result.signal ?? result.status})`);
    }
  }
  assertCurrent();
  return { status: 'passed', kind: plan.kind, identity: plan.identity, selected: plan.selected };
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log(
      'pnpm test:unit:affected --base <ref> [--run]\nPrint selection by default; --run executes existing unit scripts sequentially without Turbo.\nRequires the normal task-specific test environment; never replaces mandatory gates.'
    );
    return;
  }
  const execute = args.includes('--run');
  const options = args.filter(arg => arg !== '--run');
  if (
    options.length !== 2 ||
    options[0] !== '--base' ||
    args.filter(arg => arg === '--run').length > 1
  ) {
    throw new Error('Usage: pnpm test:unit:affected --base <ref> [--run]');
  }
  const root = fs.realpathSync(fileURLToPath(new URL('..', import.meta.url)));
  const refresh = () => buildUnitPlan(root, options[1]);
  const plan = refresh();
  console.log(JSON.stringify(plan, null, 2));
  if (execute) console.log(JSON.stringify(runSelectedUnits(plan, { refresh }), null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(`Affected unit feedback failed: ${error.message}`);
    process.exitCode = 1;
  }
}
