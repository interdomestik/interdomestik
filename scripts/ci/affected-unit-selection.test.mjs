import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { buildUnitPlan, selectUnitPackages } from '../affected-unit-plan.mjs';
import { runSelectedUnits } from '../test-unit-affected.mjs';

const pkg = (name, dependencies = {}, task = true, field = 'dependencies') => ({
  name,
  directory: `packages/${name}`,
  manifest: { name, [field]: dependencies, scripts: task ? { 'test:unit': 'node test.mjs' } : {} },
});
const graph = [
  pkg('ui', {}, false),
  pkg('middle', { ui: '*' }, false),
  pkg('web', { middle: '*' }),
  pkg('unrelated'),
];

test('selection crosses taskless packages and follows every dependency kind', () => {
  for (const field of [
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'optionalDependencies',
  ]) {
    const packages = [...graph.slice(0, 2), pkg('web', { middle: '*' }, true, field), graph[3]];
    assert.deepEqual(selectUnitPackages(packages, ['packages/ui/button.ts']).selected, ['web']);
  }
  assert.deepEqual(selectUnitPackages(graph, []).selected, []);
});

test('cycles terminate and include all affected tasks', () => {
  const packages = [pkg('a', { b: '*' }), pkg('b', { a: '*' }), pkg('c')];
  assert.deepEqual(selectUnitPackages(packages, ['packages/a/a.ts']).selected, ['a', 'b']);
});

test('root, unknown, config, manifest and uncertain local dependencies widen to all', () => {
  for (const file of [
    'pnpm-lock.yaml',
    'scripts/shared.mjs',
    'unknown/file.ts',
    'packages/ui/package.json',
    'packages/web/vitest.config.ts',
  ]) {
    const result = selectUnitPackages(graph, [file]);
    assert.equal(result.mode, 'all-unit');
    assert.deepEqual(result.selected, ['unrelated', 'web']);
  }
  assert.equal(
    selectUnitPackages([pkg('a', { alias: 'workspace:../other' }), pkg('b')], []).mode,
    'all-unit'
  );
});

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'affected-unit-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const git = args =>
    execFileSync('git', args, { cwd: root, stdio: 'pipe', encoding: 'utf8' }).trim();
  const write = (file, content) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), content);
  };
  write(
    'package.json',
    JSON.stringify({ name: 'fixture', private: true, packageManager: 'pnpm@10.28.2' })
  );
  write('pnpm-workspace.yaml', 'packages:\n  - packages/*\n');
  write('.gitignore', '.env.local\nnode_modules/\n');
  for (const item of graph) {
    const manifest = structuredClone(item.manifest);
    for (const name of Object.keys(manifest.dependencies ?? {}))
      manifest.dependencies[name] = 'workspace:*';
    write(`${item.directory}/package.json`, JSON.stringify(manifest));
    write(`${item.directory}/source.ts`, 'export const n = 1;\n');
    write(`${item.directory}/test.mjs`, 'process.exit(0);\n');
  }
  git(['init', '-q']);
  git(['add', '.']);
  git([
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '-qm',
    'base',
  ]);
  return { root, write, git, base: git(['rev-parse', 'HEAD']) };
}

test('real Git and pnpm discovery includes commits, dirty files, untracked files and both rename paths', t => {
  const { root, write, git, base } = fixture(t);
  write('packages/ui/source.ts', 'export const n = 2;\n');
  git(['add', '.']);
  git([
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '-qm',
    'ui',
  ]);
  assert.deepEqual(buildUnitPlan(root, base).selected, ['web']);
  write('packages/unrelated/new.ts', 'new file');
  assert.deepEqual(buildUnitPlan(root, base).selected, ['unrelated', 'web']);
  fs.unlinkSync(path.join(root, 'packages/unrelated/new.ts'));
  git(['mv', 'packages/ui/source.ts', 'packages/unrelated/moved.ts']);
  const moved = buildUnitPlan(root, base);
  assert.ok(moved.changedFiles.includes('packages/ui/source.ts'));
  assert.ok(moved.changedFiles.includes('packages/unrelated/moved.ts'));
  assert.deepEqual(moved.selected, ['unrelated', 'web']);
  assert.throws(() => buildUnitPlan(root, 'missing-reference'), /Command failed/);
  assert.throws(() => buildUnitPlan(root, '--help'), /explicit --base/);
});

test('input identity changes on untracked bytes, manifests, environment and ignored env files', t => {
  const { root, write, base } = fixture(t);
  write('packages/ui/new.ts', 'a');
  const initial = buildUnitPlan(root, base);
  write('packages/ui/new.ts', 'b');
  assert.notEqual(buildUnitPlan(root, base).identity, initial.identity);
  const beforeEnv = buildUnitPlan(root, base);
  write('.env.local', 'FIXTURE_ONLY=one\n');
  assert.notEqual(buildUnitPlan(root, base).identity, beforeEnv.identity);
  const beforeManifest = buildUnitPlan(root, base);
  write('packages/web/package.json', JSON.stringify(pkg('web', { unrelated: '*' }).manifest));
  const afterManifest = buildUnitPlan(root, base);
  assert.notEqual(afterManifest.identity, beforeManifest.identity);
  assert.equal(afterManifest.mode, 'all-unit');
  process.env.AFFECTED_UNIT_FIXTURE = 'changed';
  try {
    assert.notEqual(buildUnitPlan(root, base).identity, afterManifest.identity);
  } finally {
    delete process.env.AFFECTED_UNIT_FIXTURE;
  }
});

test('runner executes selected existing scripts without Turbo and detects stale inputs', () => {
  const plan = {
    root: '/fixture',
    identity: 'one',
    selected: ['web'],
    kind: 'optional-unit-feedback',
  };
  const calls = [];
  const result = runSelectedUnits(plan, {
    refresh: () => plan,
    run: (...args) => {
      calls.push(args);
      return { status: 0 };
    },
  });
  assert.equal(result.status, 'passed');
  assert.deepEqual(calls[0].slice(0, 2), ['pnpm', ['--filter', 'web', 'run', 'test:unit']]);
  assert.throws(
    () =>
      runSelectedUnits(plan, {
        refresh: () => ({ identity: 'changed' }),
        run: () => assert.fail('must not run'),
      }),
    /Inputs changed/
  );
  let changed = false;
  assert.throws(
    () =>
      runSelectedUnits(plan, {
        refresh: () => (changed ? { identity: 'changed' } : plan),
        run: () => {
          changed = true;
          return { status: 0 };
        },
      }),
    /Inputs changed/
  );
});

test('runner reports exit, signal and spawn failure instead of successful feedback', () => {
  const plan = { root: '/fixture', identity: 'one', selected: ['web'] };
  for (const result of [
    { status: 23 },
    { status: null, signal: 'SIGTERM' },
    { error: new Error('ENOENT') },
  ]) {
    assert.throws(
      () => runSelectedUnits(plan, { refresh: () => plan, run: () => result }),
      /failed|ENOENT/
    );
  }
});

test('malformed dependency metadata fails visibly instead of underselecting', () => {
  for (const dependencies of [null, 'ui', ['ui'], { ui: null }]) {
    assert.throws(() => selectUnitPackages([pkg('web', dependencies)], []), /Invalid/);
  }
});

test('real selected workspace task runs successfully without touching a database', t => {
  const { root, write, base } = fixture(t);
  write('packages/ui/source.ts', 'export const n = 3;\n');
  const refresh = () => buildUnitPlan(root, base);
  const plan = refresh();
  assert.deepEqual(plan.selected, ['web']);
  assert.equal(runSelectedUnits(plan, { refresh }).status, 'passed');
});

test('untracked directory symlinks are bound as links without reading their targets', t => {
  const { root, base } = fixture(t);
  fs.symlinkSync(path.join(root, 'packages/ui'), path.join(root, 'linked-directory'));
  assert.equal(buildUnitPlan(root, base).mode, 'all-unit');
});

test('ignored environment symlink target bytes invalidate the execution identity', t => {
  const { root, write, base } = fixture(t);
  write('.git/info/exclude', 'ignored-env\n');
  write('ignored-env', 'FIXTURE_VALUE=one\n');
  fs.symlinkSync('ignored-env', path.join(root, '.env.local'));
  const initial = buildUnitPlan(root, base);
  write('ignored-env', 'FIXTURE_VALUE=two\n');
  const changed = buildUnitPlan(root, base);
  assert.deepEqual(changed.changedFiles, initial.changedFiles);
  assert.notEqual(changed.identity, initial.identity);
});
