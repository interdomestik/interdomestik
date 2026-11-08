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
import { contractScratch, groupHasLiveMember, scanGroupPs } from './contract-test-scratch.mjs';

const [candidate] = GUARD_TRUST_SHARDS.candidate;

function fixtureRoot(t, parent, file, body) {
  const root = fs.mkdtempSync(path.join(parent, 'contract-scratch-proof-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  // Under the launcher the fixtures stay inside its scratch, which survives an interrupted test.
  const managed = process.env.INTERDOMESTIK_CONTRACT_TMPDIR;
  if (managed) assert.ok(root.startsWith(fs.realpathSync(managed) + path.sep), root);
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
  { skip: process.platform === 'win32', timeout: 40000 },
  async t => {
    // Inside a managed shard this is the shard's own scratch.
    const parent = fs.realpathSync(os.tmpdir());
    const runner = new URL('./contract-test-shards.mjs', import.meta.url).href;
    const cases = [
      { args: ['z620'], file: 'scripts/ci/z620-runner.test.mjs', descendant: true },
      { args: ['z620'], file: 'scripts/ci/z620-runner.test.mjs', fail: true },
      { args: ['guard-trust', 'candidate'], file: candidate },
      { args: ['guard-trust', 'candidate'], file: candidate, fail: true },
      { args: ['guard-trust', 'candidate'], file: candidate, signal: 'SIGTERM' },
      { args: ['z620'], file: 'scripts/ci/z620-runner.test.mjs', signal: 'SIGINT' },
      // Ignores the signal and leaves a descendant holding the runner's stdio open.
      {
        args: ['z620'],
        file: 'scripts/ci/z620-runner.test.mjs',
        signal: 'SIGTERM',
        stubborn: true,
      },
    ];

    for (const { args, file, fail, signal, descendant, stubborn } of cases) {
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
          ${
            stubborn
              ? "process.on('SIGTERM', () => {}); spawn(process.execPath, ['-e', 'process.on(\"SIGTERM\", () => {}); setInterval(() => {}, 1000)'], { stdio: 'inherit' });"
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
          // The fixture reported its directory inside the shard's own scratch, which still exists.
          const [scratch, ...others] = fs
            .readdirSync(temporary)
            .filter(name => name !== 'neighbor');
          assert.deepEqual(others, []);
          const fixtures = fs.readdirSync(path.join(temporary, scratch));
          const [fixture] = fixtures.filter(name => name.startsWith('fixture-'));
          assert.equal(
            fs.readFileSync(ready, 'utf8'),
            path.join(fs.realpathSync(temporary), scratch, fixture)
          );
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

test('managed scratch leaves room for Unix socket paths inside it', async () => {
  // Inside a managed shard this reuses the shard's scratch, exactly as a nested runner does.
  const env = { ...process.env };
  const scratch = contractScratch(env);
  try {
    // tsx creates `<TMPDIR>/tsx-<uid>/<pid>.pipe`; sun_path holds 103 bytes on macOS.
    const uid = process.getuid?.() ?? 0;
    const socket = path.join(scratch.directory, `tsx-${uid}`, '4194304.pipe');
    assert.ok(socket.length <= 103, `${socket} is ${socket.length} bytes`);
  } finally {
    await scratch.cleanup();
  }
});

test('a process group holding only zombies counts as finished', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'proc-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const proc = (pid, comm, state, pgrp) => {
    fs.mkdirSync(path.join(root, String(pid)));
    fs.writeFileSync(path.join(root, String(pid), 'stat'), `${pid} (${comm}) ${state} 1 ${pgrp} 0`);
  };
  proc(10, 'node', 'Z', 10);
  proc(11, 'a b) (c', 'Z', 10);
  proc(12, 'node', 'S', 99);
  fs.mkdirSync(path.join(root, 'self'));
  assert.equal(groupHasLiveMember(10, root), false);
  fs.mkdirSync(path.join(root, '14')); // Listed, then gone before its stat could be read.
  assert.equal(groupHasLiveMember(10, root), true);
  fs.rmdirSync(path.join(root, '14'));
  proc(13, 'node', 'R', 10);
  assert.equal(groupHasLiveMember(10, root), true);
  assert.equal(groupHasLiveMember(10, path.join(root, 'missing')), null);
});

test('only two complete passes over the same zombies prove a group finished', () => {
  const passes = results => () => results.shift();
  const zombies = (list, incomplete = false) => ({ live: false, zombies: list, incomplete });
  // A member forks after the first listing, then becomes a zombie: the second pass sees the child.
  assert.equal(groupHasLiveMember(10, '/proc', passes([zombies('10'), zombies('10,11')])), true);
  assert.equal(groupHasLiveMember(10, '/proc', passes([zombies('10'), { live: true }])), true);
  assert.equal(groupHasLiveMember(10, '/proc', passes([zombies('10', true), zombies('10')])), true);
  assert.equal(
    groupHasLiveMember(10, '/proc', passes([zombies('10,11'), zombies('10,11')])),
    false
  );
});

test('a ps snapshot decides group liveness where procfs is missing', () => {
  const listing = rows => () => rows.join('\n');
  assert.deepEqual(scanGroupPs(7, listing(['  7  7 Z', ' 8 7 Z+', ' 9 3 S'])), {
    live: false,
    zombies: '7,8',
    incomplete: false,
  });
  assert.deepEqual(scanGroupPs(7, listing([' 7 7 Z', ' 8 7 S+'])), { live: true });
  const failing = () => {
    throw new Error('ps unavailable');
  };
  assert.equal(scanGroupPs(7, failing).incomplete, true);
  // An unknown snapshot never proves the group finished.
  const scans = [scanGroupPs(7, failing), scanGroupPs(7, failing)];
  assert.equal(
    groupHasLiveMember(7, '/proc', () => scans.shift()),
    true
  );
});

test(
  'scratch cleanup ends a nested group whose supervisor is gone, even one ignoring SIGTERM',
  { skip: process.platform === 'win32', timeout: 20000 },
  async () => {
    for (const stubborn of [false, true]) {
      const env = { ...process.env };
      delete env.INTERDOMESTIK_CONTRACT_TMPDIR; // An outer supervisor, not a reused scratch.
      const scratch = contractScratch(env);
      const nested = path.join(scratch.directory, 'fixture', 'idct-nested');
      fs.mkdirSync(nested, { recursive: true });
      const code = `${stubborn ? "process.on('SIGTERM', () => {});" : ''} setInterval(() => {}, 1000);`;
      const orphan = spawn(process.execPath, ['-e', code], { detached: true, stdio: 'ignore' });
      const exited = new Promise(resolve => orphan.once('exit', (_, signal) => resolve(signal)));
      fs.writeFileSync(path.join(nested, '.idct-group'), String(orphan.pid));
      await setTimeout(200); // Let the orphan install its handler.
      const cleanup = scratch.cleanup();
      if (stubborn) await assert.rejects(cleanup, /were still running and were killed/u);
      else await cleanup;
      assert.equal(await exited, stubborn ? 'SIGKILL' : 'SIGTERM');
      assert.equal(fs.existsSync(scratch.directory), false);
    }
  }
);
