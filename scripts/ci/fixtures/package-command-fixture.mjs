import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../..', import.meta.url));
const preload = fileURLToPath(new URL('./package-command-effects.cjs', import.meta.url));

export function commandFixtureEnv(env = {}) {
  const result = { ...process.env, ...env, NODE_OPTIONS: `--require=${preload}` };
  for (const name of ['pnpm', 'lsof']) {
    const hasFixture = result.PATH.split(':').some(
      dir => dir.includes('/interdomestik-command-') && existsSync(join(dir, name))
    );
    if (hasFixture) result[`PACKAGE_COMMAND_FIXTURE_${name.toUpperCase()}`] = '1';
  }
  return result;
}

export function fixture(t, name = 'pnpm') {
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

export function run(script, args, env = {}) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    encoding: 'utf8',
    timeout: 10_000,
    env: commandFixtureEnv(env),
  });
  for (const line of (result.stdout ?? '').split('\n')) {
    if (!line.startsWith('PACKAGE_COMMAND_CAPTURE ')) continue;
    const capture = JSON.parse(line.slice('PACKAGE_COMMAND_CAPTURE '.length));
    const target = env[capture.name === 'LSOF' ? 'FAKE_LSOF_CAPTURE' : 'FAKE_COMMAND_CAPTURE'];
    if (target) writeFileSync(target, JSON.stringify(capture.args));
  }
  return result;
}
