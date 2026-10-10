import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { rootDir } from './db-access-guard-test-utils.mjs';
import { runGit } from './db-access-git.mjs';

const protectedLock = runGit(
  ['-C', rootDir, 'show', '278e33ab0dd448547fa81d4b0ff122b4d69c901e:pnpm-lock.yaml'],
  { encoding: 'utf8' }
);
const lockLines = protectedLock.split('\n');
const header = '  typescript@5.9.3:';
const start = lockLines.indexOf(header);
assert.ok(
  start >= 0 && lockLines.lastIndexOf(header) === start,
  'protected TypeScript block must be unique'
);
const block = [];
for (let index = start + 1; index < lockLines.length; index++) {
  const line = lockLines[index];
  if (line.length > 0 && !line.startsWith('    ')) break;
  block.push(line);
}
const expected = /integrity: (sha512-[A-Za-z0-9+/=]+)/u.exec(block.join('\n'))?.[1];
assert.ok(expected, 'actual protected TypeScript integrity must exist');
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'db-guard-registry-'));
process.on('exit', () => fs.rmSync(home, { recursive: true, force: true }));
const cache = path.join(rootDir, 'tmp', 'db-access-protected', 'typescript-5.9.3.tgz');
fs.mkdirSync(path.dirname(cache), { recursive: true });
if (!fs.existsSync(cache)) {
  const download = path.join(home, 'download.tgz');
  const result = spawnSync(
    '/usr/bin/curl',
    [
      '--fail',
      '--silent',
      '--show-error',
      '--location',
      '--proto',
      '=https',
      '--proto-redir',
      '=https',
      '--tlsv1.2',
      '--connect-timeout',
      '10',
      '--max-time',
      '120',
      '--retry',
      '2',
      '--retry-delay',
      '2',
      '--retry-all-errors',
      '--max-filesize',
      '40000000',
      '--output',
      download,
      'https://registry.npmjs.org/typescript/-/typescript-5.9.3.tgz',
    ],
    { env: { PATH: '/usr/bin:/bin', HOME: home }, encoding: 'utf8', timeout: 180000 }
  );
  assert.equal(result.status, 0, result.stderr);
  const sri = 'sha512-' + createHash('sha512').update(fs.readFileSync(download)).digest('base64');
  assert.equal(sri, expected);
  fs.renameSync(download, cache);
}
export const tsTarball = path.resolve(cache);
assert.equal(
  'sha512-' + createHash('sha512').update(fs.readFileSync(tsTarball)).digest('base64'),
  expected
);
const extract = spawnSync(
  '/usr/bin/tar',
  ['-xzf', tsTarball, '-C', home, '--no-same-owner', '--no-same-permissions'],
  { encoding: 'utf8' }
);
assert.equal(extract.status, 0, extract.stderr);
export const verifiedCompiler = path.join(home, 'package');
assert.equal(
  JSON.parse(fs.readFileSync(path.join(verifiedCompiler, 'package.json'))).version,
  '5.9.3'
);
