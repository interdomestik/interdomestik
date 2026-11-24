import { execFileSync } from 'node:child_process';
import {
  cpSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import yaml from 'js-yaml';
import { repoRoot } from './inventory.mjs';
import { protectedLanes } from './protected-lanes.mjs';

export function scratch(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'db-lanes-')));
  t.after(() => rmSync(root, { force: true, recursive: true }));
  return root;
}

export function copyProtectedSelectors(root) {
  for (const file of [
    '.github/workflows/ci.yml',
    'package.json',
    'packages/database/package.json',
    'packages/domain-communications/package.json',
    'packages/domain-membership-billing/package.json',
    'packages/domain-users/package.json',
    'scripts/run-staff-detail-rls.mjs',
  ]) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    cpSync(join(repoRoot, file), join(root, file));
  }
  updateWorkflow(root, workflow => {
    delete workflow.jobs.unit.if;
    delete workflow.jobs.unit.steps.find(step => step.name === 'Coverage Gate').if;
  });
}

const workflowPath = '.github/workflows/ci.yml';
export const project = 'packages/domain-users';
export const configPath = `${project}/vitest.config.ts`;
export const suite = `${project}/src/admin/get-users.rls.test.ts`;
export const mockSuite = [
  "import { describe, it, vi } from 'vitest';",
  "vi.mock('@interdomestik/database', () => ({}));",
  "describe('mocked suite', () => { it('runs', () => {}); });",
].join('\n');

export function updateWorkflow(root, update) {
  const file = join(root, workflowPath);
  const workflow = yaml.load(readFileSync(file, 'utf8'));
  update(workflow);
  writeFileSync(file, yaml.dump(workflow));
}

export function inventoryFixture(t, extra = []) {
  const root = scratch(t);
  copyProtectedSelectors(root);
  cpSync(join(repoRoot, configPath), join(root, configPath));
  symlinkSync(join(repoRoot, 'node_modules'), join(root, 'node_modules'));
  symlinkSync(join(repoRoot, project, 'node_modules'), join(root, project, 'node_modules'));
  const file = 'scripts/pilot/local-container.rls.test.ts';
  const exclusions = [
    {
      file,
      reason: 'Starts its own container.',
      owner: 'Database',
      removeWhen: 'The suite can use the job service.',
    },
  ];
  const fixtures = new Map([
    ...protectedLanes(root).flatMap(lane => lane.files.map(file => [file, ''])),
    [file, ''],
    [suite, mockSuite],
    ['scripts/ci/db-lanes/exclusions.json', JSON.stringify(exclusions)],
    ...extra,
  ]);
  for (const [file, source] of fixtures) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), source);
  }
  const git = (...args) => execFileSync('/usr/bin/git', args, { cwd: root, stdio: 'pipe' });
  git('init', '-q');
  git('add', '--', ...fixtures.keys());
  return root;
}
