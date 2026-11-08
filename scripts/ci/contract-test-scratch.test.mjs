import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { setTimeout } from 'node:timers/promises';
import {
  GUARD_TRUST_SHARDS,
  RETIRED_LEGACY_FILES,
  RETIRED_LEGACY_TESTS,
} from './contract-test-shards.mjs';

const [candidate] = GUARD_TRUST_SHARDS.candidate;

function fixtureRoot(t, parent, file, body) {
  const root = fs.mkdtempSync(path.join(parent, 'contract-scratch-proof-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const paths = new Set([
    ...Object.values(GUARD_TRUST_SHARDS).flat(),
    ...RETIRED_LEGACY_FILES,
    'scripts/check-modularity-guard.test.mjs',
    file,
  ]);
  for (const target of paths) {
    const dest = path.join(root, target);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const declarations = (RETIRED_LEGACY_TESTS[target] ?? []).map(
      name => `test(${JSON.stringify(name)}, () => {});\n`
    );
    fs.writeFileSync(
      dest,
      target === file ? body : "import test from 'node:test';\n" + declarations.join('')
    );
  }
  return root;
}

test(
  'managed Z620 and DB contract runs remove only their own scratch on pass, fail and interrupt',
  { skip: process.platform === 'win32', timeout: 20000 },
  async t => {
    // Standalone launcher proofs use a sibling of the enclosing shard, if there is one.
    const parent = path.dirname(
      process.env.INTERDOMESTIK_CONTRACT_TMPDIR ?? path.join(os.tmpdir(), '_')
    );
    const runner = new URL('./contract-test-shards.mjs', import.meta.url).href;
    const cases = [
      { args: ['z620'], file: 'scripts/ci/z620-runner.test.mjs', descendant: true },
      { args: ['z620'], file: 'scripts/ci/z620-runner.test.mjs', fail: true },
      { args: ['guard-trust', 'candidate'], file: candidate },
      { args: ['guard-trust', 'candidate'], file: candidate, fail: true },
      { args: ['guard-trust', 'candidate'], file: candidate, signal: 'SIGTERM' },
      { args: ['z620'], file: 'scripts/ci/z620-runner.test.mjs', signal: 'SIGINT' },
    ];

    for (const { args, file, fail, signal, descendant } of cases) {
      const body = `
        import { spawn } from 'node:child_process';
        import fs from 'node:fs';
        import os from 'node:os';
        import path from 'node:path';
        import test from 'node:test';
        test('scratch lifecycle', async () => {
          const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fixture-'));
          fs.writeFileSync(path.join(dir, 'owned'), 'generated');
          fs.symlinkSync(process.env.NEIGHBOR, path.join(dir, 'outside'));
          fs.chmodSync(dir, 0o500);
          fs.writeFileSync(process.env.READY + '.tmp', dir);
          fs.renameSync(process.env.READY + '.tmp', process.env.READY);
          ${
            descendant
              ? 'spawn(process.execPath, [\'-e\', \'setTimeout(() => { const fs = require("node:fs"); fs.statSync(process.argv[1]); fs.writeFileSync(process.env.READY + ".late", "done"); }, 200)\', dir], { stdio: \'ignore\' }).unref();'
              : ''
          }
          ${signal ? 'await new Promise(() => setInterval(() => {}, 1000));' : ''}
          ${fail ? "throw new Error('expected fixture failure');" : ''}
        });
      `;
      const dir = fixtureRoot(t, parent, file, body);
      const temporary = fs.mkdtempSync(path.join(dir, 'temp-'));
      const neighbor = path.join(temporary, 'neighbor');
      const ready = path.join(dir, 'ready');
      fs.writeFileSync(neighbor, 'retain', { mode: 0o400 });
      const env = { ...process.env, TMPDIR: temporary, NEIGHBOR: neighbor, READY: ready };
      delete env.NODE_TEST_CONTEXT;
      delete env.INTERDOMESTIK_CONTRACT_TMPDIR;
      const child = spawn(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          `import { main } from ${JSON.stringify(runner)};
           process.exitCode = await main(${JSON.stringify(args)}, process.cwd());`,
        ],
        { cwd: dir, env, stdio: ['ignore', 'pipe', 'pipe'] }
      );
      const output = [];
      child.stdout.on('data', chunk => output.push(chunk));
      child.stderr.on('data', chunk => output.push(chunk));
      let exited = false;
      const done = new Promise((resolve, reject) => {
        child.once('error', reject);
        child.once('close', (code, termination) => {
          exited = true;
          resolve({ code, termination });
        });
      });
      try {
        if (signal) {
          const deadline = performance.now() + 5000;
          while (!fs.existsSync(ready) && !exited && performance.now() < deadline) {
            await setTimeout(20);
          }
          assert.ok(fs.existsSync(ready), Buffer.concat(output).toString());
          assert.ok(fs.existsSync(fs.readFileSync(ready, 'utf8')));
          assert.ok(child.kill(signal));
        }
        const result = await done;
        assert.deepEqual(
          result,
          { code: fail || signal ? 1 : 0, termination: null },
          Buffer.concat(output).toString()
        );
        assert.ok(fs.existsSync(ready), 'the test actually ran');
        if (descendant) assert.equal(fs.readFileSync(ready + '.late', 'utf8'), 'done');
        assert.deepEqual(fs.readdirSync(temporary), ['neighbor']);
        assert.equal(fs.readFileSync(neighbor, 'utf8'), 'retain');
        assert.equal(fs.statSync(neighbor).mode & 0o777, 0o400);
      } finally {
        if (!exited) child.kill('SIGTERM');
        await done;
      }
    }
  }
);
