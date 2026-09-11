import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../..', import.meta.url));

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
  return spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    encoding: 'utf8',
    timeout: 10_000,
    env: { ...process.env, ...env },
  });
}
