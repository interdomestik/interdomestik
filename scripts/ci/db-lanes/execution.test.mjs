import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { checkExecution, readExecution, spawnPnpm } from './execution.mjs';
import { repoRoot } from './inventory.mjs';

const selected = 'packages/database/test/proof.test.ts';
const passed = {
  file: selected,
  passed: 1,
  failed: 0,
  skipped: 0,
  todo: 0,
  cancelled: 0,
  retried: 0,
};

test('requires nonempty per-file results for the exact selection', () => {
  assert.deepEqual(checkExecution([selected], { complete: true, files: [passed] }), []);
  assert.match(checkExecution([], { complete: true, files: [] }).join(), /empty selection/u);
  assert.match(checkExecution([selected], { complete: true, files: [] }).join(), /missing result/u);
  const unrelated = { ...passed, file: 'another.test.ts' };
  assert.match(
    checkExecution([selected], { complete: true, files: [passed, unrelated] }).join(),
    /unexpected result/u
  );
  assert.match(
    checkExecution([selected], { complete: true, files: [passed, passed] }).join(),
    /duplicate result/u
  );
});

test('refuses incomplete, skipped, TODO, retried, or zero-case results', () => {
  assert.match(
    checkExecution([selected], { complete: false, files: [passed] }).join(),
    /incomplete/u
  );
  for (const key of ['failed', 'skipped', 'todo', 'cancelled', 'retried']) {
    const report = { complete: true, files: [{ ...passed, [key]: 1 }] };
    assert.match(checkExecution([selected], report).join(), new RegExp(`\\b${key}\\b`, 'u'));
  }
  assert.match(
    checkExecution([selected], { complete: true, files: [{ ...passed, passed: 0 }] }).join(),
    /no passing cases/u
  );
});

test('rejects missing, blank, malformed and valid-but-empty reports', t => {
  const root = mkdtempSync(join(tmpdir(), 'db-lanes-evidence-'));
  t.after(() => rmSync(root, { force: true, recursive: true }));
  const filename = join(root, 'report.json');
  assert.throws(() => readExecution(filename), /missing/u);
  for (const [contents, expected] of [
    [' ', /empty/u],
    ['{', /invalid JSON/u],
    ['{}', /invalid shape/u],
  ]) {
    writeFileSync(filename, contents);
    assert.throws(() => readExecution(filename), expected);
  }
});

test('a real Node run reports cases per file and gives a testless file no credit', t => {
  const root = mkdtempSync(join(tmpdir(), 'db-lanes-node-'));
  t.after(() => rmSync(root, { force: true, recursive: true }));
  writeFileSync(join(root, 'pass.mjs'), "import test from 'node:test'; test('pass', () => {});");
  writeFileSync(join(root, 'empty.mjs'), '');
  const module = new URL('./execution.mjs', import.meta.url).href;
  writeFileSync(
    join(root, 'run.mjs'),
    `import { nodeExecution } from ${JSON.stringify(module)};
    console.log(JSON.stringify(await nodeExecution(import.meta.dirname, ['pass.mjs', 'empty.mjs'], [])));`
  );
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const output = execFileSync(process.execPath, [join(root, 'run.mjs')], { env, encoding: 'utf8' });
  const report = JSON.parse(output);
  assert.deepEqual(report.files, [{ ...passed, file: 'pass.mjs' }]);
  assert.match(
    checkExecution(['pass.mjs', 'empty.mjs'], report).join(),
    /missing result.*empty\.mjs/u
  );
});

test('a real Vitest run records skips, TODOs and retries even when Vitest exits zero', t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'db-lanes-vitest-test-')));
  t.after(() => rmSync(root, { force: true, recursive: true }));
  const filename = join(root, 'report.json');
  const config = join(root, 'vitest.config.mjs');
  writeFileSync(config, 'export default {};');
  writeFileSync(
    join(root, 'cases.test.mjs'),
    `
    let attempts = 0;
    test('ordinary', () => {});
    test.skip('skipped', () => {});
    test.todo('planned');
    test('retry', { retry: 1 }, () => {
      if (++attempts === 1) throw new Error('synthetic first-attempt failure');
    });
  `
  );
  const run = spawnPnpm(
    [
      'exec',
      'vitest',
      'run',
      '--root',
      root,
      '--config',
      config,
      '--globals',
      '--retry=0',
      '--reporter',
      join(import.meta.dirname, 'vitest-reporter.mjs'),
    ],
    {
      cwd: join(repoRoot, 'packages/domain-users'),
      env: { ...process.env, DB_LANES_ROOT: root, DB_LANES_REPORT: filename },
      stdio: 'ignore',
    }
  );
  assert.equal(run.status, 0);
  const report = readExecution(filename);
  assert.deepEqual(report, {
    complete: true,
    files: [{ ...passed, file: 'cases.test.mjs', passed: 2, skipped: 1, todo: 1, retried: 1 }],
  });
  assert.equal(checkExecution(['cases.test.mjs'], report).length, 3);
});
