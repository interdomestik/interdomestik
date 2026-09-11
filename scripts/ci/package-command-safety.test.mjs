import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const realPnpm = spawnSync('which', ['pnpm'], { encoding: 'utf8' }).stdout.trim();
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const databaseCommand = join(root, 'scripts/database-command.mjs');
const devClean = join(root, 'scripts/dev-clean.mjs');
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const databasePackageJson = JSON.parse(
  readFileSync(join(root, 'packages/database/package.json'), 'utf8')
);

function fixture(t, name = 'pnpm') {
  const directory = mkdtempSync(join(tmpdir(), 'interdomestik-command-'));
  const capturePath = join(directory, 'capture.json');
  const executable = join(directory, name);
  writeFileSync(
    executable,
    `#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
const prefix = process.argv[1].endsWith('/lsof') ? 'FAKE_LSOF' : 'FAKE_COMMAND';
const capture = process.env[prefix + '_CAPTURE'];
if (capture) {
  writeFileSync(capture, JSON.stringify(process.argv.slice(2)));
}
if (process.env[prefix + '_STDOUT']) process.stdout.write(process.env[prefix + '_STDOUT']);
if (process.env[prefix + '_STDERR']) process.stderr.write(process.env[prefix + '_STDERR']);
process.exit(Number(process.env[prefix + '_EXIT'] ?? 0));
`
  );
  chmodSync(executable, 0o755);
  t.after(() => rmSync(directory, { force: true, recursive: true }));
  return { capturePath, directory, executable };
}

function run(script, args, env = {}) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    encoding: 'utf8',
    timeout: 10_000,
    env: { ...process.env, ...env },
  });
}

test('database commands delegate to the intended package tools without applying anything', t => {
  const generate = fixture(t);
  const generateResult = run(databaseCommand, ['generate', '--name', 'safe-name'], {
    FAKE_COMMAND_CAPTURE: generate.capturePath,
    PATH: `${generate.directory}:${process.env.PATH}`,
  });
  assert.equal(generateResult.status, 0, generateResult.stderr);
  assert.deepEqual(JSON.parse(readFileSync(generate.capturePath, 'utf8')), [
    '--filter',
    '@interdomestik/database',
    'run',
    'generate',
    '--name',
    'safe-name',
  ]);

  const push = fixture(t);
  const pushResult = run(databaseCommand, ['push-local', '--dry-run', '--include-all'], {
    FAKE_COMMAND_CAPTURE: push.capturePath,
    PATH: `${push.directory}:${process.env.PATH}`,
  });
  assert.equal(pushResult.status, 0, pushResult.stderr);
  assert.deepEqual(JSON.parse(readFileSync(push.capturePath, 'utf8')), [
    '--filter',
    '@interdomestik/database',
    'exec',
    'supabase',
    'db',
    'push',
    '--local',
    '--workdir',
    `${root}/`,
    '--dry-run',
    '--include-all',
  ]);
});

test('push-local rejects every target override before launching the package command', t => {
  for (const argument of [
    '--local',
    '--local=false',
    '--linked',
    '--db-url',
    '--db-url=postgresql://remote.invalid/db',
    '--project-ref=remote-ref',
    '--password=secret',
    '-psecret',
    '--workdir=/tmp/foreign-project',
    '--dns-resolver=https',
    '--include-seed',
    '--unknown-option',
    '--',
    '--linked=true',
  ]) {
    const current = fixture(t);
    const result = run(databaseCommand, ['push-local', '--dry-run', argument], {
      FAKE_COMMAND_CAPTURE: current.capturePath,
      PATH: `${current.directory}:${process.env.PATH}`,
    });
    assert.equal(result.status, 2, `${argument}: ${result.stderr}`);
    assert.match(result.stderr, /refused unsafe push-local argument/u);
    assert.doesNotMatch(result.stderr, /secret|remote\.invalid/u);
    assert.equal(existsSync(current.capturePath), false, argument);
  }
});

test('database wrapper propagates a delegated command failure', t => {
  const current = fixture(t);
  const result = run(databaseCommand, ['generate'], {
    FAKE_COMMAND_EXIT: '7',
    PATH: `${current.directory}:${process.env.PATH}`,
  });
  assert.equal(result.status, 7);
});

test('dev:clean refuses a listener PID and leaves the fixture process alive', async t => {
  const dummy = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)']);
  await once(dummy, 'spawn');
  t.after(async () => {
    dummy.kill('SIGTERM');
    await once(dummy, 'exit');
  });
  const probe = fixture(t, 'lsof');
  const dev = fixture(t);
  const result = run(devClean, [], {
    FAKE_COMMAND_CAPTURE: dev.capturePath,
    FAKE_LSOF_STDOUT: `${dummy.pid}\n`,
    PATH: `${probe.directory}:${dev.directory}:${process.env.PATH}`,
  });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /port 3000 is already in use/u);
  assert.equal(existsSync(dev.capturePath), false);
  assert.doesNotThrow(() => process.kill(dummy.pid, 0));
});

test('dev:clean starts dev only when the listener probe proves the port is free', t => {
  const probe = fixture(t, 'lsof');
  const dev = fixture(t);
  const result = run(devClean, [], {
    FAKE_COMMAND_CAPTURE: dev.capturePath,
    FAKE_LSOF_EXIT: '1',
    PATH: `${probe.directory}:${dev.directory}:${process.env.PATH}`,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(readFileSync(dev.capturePath, 'utf8')), ['dev']);
});

test('dev:clean fails closed when the listener probe is ambiguous', t => {
  const probe = fixture(t, 'lsof');
  const dev = fixture(t);
  const result = run(devClean, [], {
    FAKE_LSOF_EXIT: '2',
    FAKE_COMMAND_CAPTURE: dev.capturePath,
    PATH: `${probe.directory}:${dev.directory}:${process.env.PATH}`,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /could not safely determine/u);
  assert.equal(existsSync(dev.capturePath), false);
});

test('dev:clean refuses probe errors, ambiguous output and unsupported arguments', t => {
  const probe = fixture(t, 'lsof');
  const dev = fixture(t);
  for (const env of [
    { FAKE_LSOF_EXIT: '0' },
    { FAKE_LSOF_EXIT: '1', FAKE_LSOF_STDERR: 'permission denied' },
    { FAKE_LSOF_EXIT: '1', FAKE_LSOF_STDOUT: '123' },
    { PATH: join(probe.directory, 'missing') },
  ]) {
    const result = run(devClean, [], {
      PATH: `${probe.directory}:${dev.directory}:${process.env.PATH}`,
      FAKE_COMMAND_CAPTURE: dev.capturePath,
      ...env,
    });
    assert.equal(result.status, 1);
    assert.equal(existsSync(dev.capturePath), false);
  }
  assert.equal(run(devClean, ['--port=4000']).status, 2);
});

test('pnpm forwards root command arguments without shell evaluation', t => {
  const current = fixture(t);
  const result = spawnSync(
    realPnpm,
    ['run', 'db:generate', '--', '--name', 'name;$(not-a-command)'],
    {
      cwd: root,
      encoding: 'utf8',
      timeout: 10_000,
      env: {
        ...process.env,
        FAKE_COMMAND_CAPTURE: current.capturePath,
        PATH: `${current.directory}:${process.env.PATH}`,
      },
    }
  );
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(readFileSync(current.capturePath, 'utf8')).slice(-2), [
    '--name',
    'name;$(not-a-command)',
  ]);
});

test('package generation alias and Husky prepare execute the intended tools in a fixture', t => {
  const current = fixture(t, 'command.mjs');
  for (const tool of ['drizzle-kit', 'husky']) {
    const executable = join(current.directory, tool);
    writeFileSync(executable, readFileSync(current.executable));
    chmodSync(executable, 0o755);
  }
  writeFileSync(
    join(current.directory, 'package.json'),
    JSON.stringify({
      type: 'module',
      scripts: {
        'db:generate': databasePackageJson.scripts['db:generate'],
        generate: databasePackageJson.scripts.generate,
        prepare: packageJson.scripts.prepare,
      },
    })
  );
  for (const [command, expected] of [
    ['db:generate', ['generate']],
    ['prepare', ['install']],
  ]) {
    const result = spawnSync(realPnpm, ['run', command], {
      cwd: current.directory,
      encoding: 'utf8',
      timeout: 10_000,
      env: {
        ...process.env,
        PATH: `${current.directory}:${process.env.PATH}`,
        FAKE_COMMAND_CAPTURE: current.capturePath,
      },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(readFileSync(current.capturePath, 'utf8')), expected);
  }
});

test('package command contracts remain truthful and keep heavy proof explicit', () => {
  assert.equal(packageJson.scripts['db:generate'], 'node scripts/database-command.mjs generate');
  assert.equal(
    packageJson.scripts['db:push:local'],
    'node scripts/database-command.mjs push-local'
  );
  assert.equal(packageJson.scripts['dev:clean'], 'node scripts/dev-clean.mjs');
  assert.equal(packageJson.scripts.prepare, 'husky install');
  assert.equal(packageJson.scripts['check:fast'], 'node scripts/check-fast.mjs');
  assert.equal(
    packageJson.scripts['slice:e2e:pr'],
    'node scripts/run-with-default-db-url.mjs pnpm e2e:gate:pr'
  );
  assert.doesNotMatch(packageJson.scripts['check:fast'], /e2e|playwright|build|db:|doctor|kill/u);
  assert.doesNotMatch(packageJson.scripts['pr:verify'], /memory:precheck/u);
  for (const required of [
    'db:rls:test:required',
    'coverage:gate',
    'e2e:gate',
    'e2e:smoke',
    'check:db-access',
    'check:architecture-boundaries',
  ]) {
    assert.match(packageJson.scripts['pr:verify'], new RegExp(required.replace(':', '\\:')));
  }
  assert.equal(databasePackageJson.scripts['db:generate'], 'pnpm run generate');
  assert.equal(databasePackageJson.scripts.generate, 'drizzle-kit generate');
});
