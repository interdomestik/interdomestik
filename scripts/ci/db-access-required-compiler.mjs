import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  SOURCE_COMMIT,
  TS,
  requireCommit,
  rootDir,
  showAt,
  tmp,
} from './db-access-required-git.mjs';

export const sri = file =>
  `sha512-${createHash('sha512').update(fs.readFileSync(file)).digest('base64')}`;
requireCommit(SOURCE_COMMIT, 'approved source lock');
const lockLines = showAt(SOURCE_COMMIT, 'pnpm-lock.yaml').toString('utf8').split('\n');
const header = `  typescript@${TS}:`;
const start = lockLines.indexOf(header);
assert.ok(
  start >= 0 && lockLines.lastIndexOf(header) === start,
  'approved TypeScript block must be unique'
);
let end = start + 1;
while (end < lockLines.length && (lockLines[end] === '' || lockLines[end].startsWith('    ')))
  end += 1;
export const protectedIntegrity = /integrity: (sha512-[A-Za-z0-9+/=]+)/u.exec(
  lockLines.slice(start + 1, end).join('\n')
)?.[1];
assert.ok(protectedIntegrity, 'approved source lock TypeScript integrity must exist');

// Cached official registry archive (downloaded once, accepted only at the approved lock SRI).
// Corrupt-compiler tests build a separate synthetic repack; this file is never rewritten.
export const officialArchive = path.join(
  rootDir,
  'tmp',
  'db-access-protected',
  `typescript-${TS}.tgz`
);
if (!fs.existsSync(officialArchive)) {
  fs.mkdirSync(path.dirname(officialArchive), { recursive: true });
  const partial = `${officialArchive}.${process.pid}.partial`;
  try {
    const download = spawnSync(
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
        partial,
        `https://registry.npmjs.org/typescript/-/typescript-${TS}.tgz`,
      ],
      { env: { PATH: '/usr/bin:/bin', HOME: tmp('curl-home') }, encoding: 'utf8', timeout: 180000 }
    );
    assert.equal(download.status, 0, download.stderr);
    assert.equal(sri(partial), protectedIntegrity, 'official archive must match the approved lock');
    fs.renameSync(partial, officialArchive);
  } finally {
    fs.rmSync(partial, { force: true });
  }
}
assert.equal(
  sri(officialArchive),
  protectedIntegrity,
  'cached official archive must match the approved lock'
);
const home = tmp('compiler');
const extract = spawnSync(
  '/usr/bin/tar',
  ['-xzf', officialArchive, '-C', home, '--no-same-owner', '--no-same-permissions'],
  { env: { PATH: '/usr/bin:/bin' }, encoding: 'utf8' }
);
assert.equal(extract.status, 0, extract.stderr);
export const verifiedCompiler = path.join(home, 'package');
assert.equal(
  JSON.parse(fs.readFileSync(path.join(verifiedCompiler, 'package.json'), 'utf8')).version,
  TS
);
