import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { authenticateRuntimeContext, safeEnv } from '../db-access-provider-runtime-identity.mjs';
const PREFIX = 'scripts/ci/p2/';
const HELPERS = [
  'scripts/ci/db-access-provider-runtime-identity.mjs',
  'scripts/ci/clean-coverage-artifacts.mjs',
  'scripts/ci/coverage-gate.mjs',
];
// The pinned required-workflow entry authenticates its source pin before importing this helper.
// This copies bytes directly from that commit, never from a candidate working tree or local tag.
export function materializeRequiredP2Producer({ gitDir, context, targetRoot }) {
  authenticateRuntimeContext(gitDir, context);
  if (fs.existsSync(targetRoot)) throw Error('P2 producer target must be fresh');
  fs.mkdirSync(targetRoot, { mode: 0o700 });
  const root = fs.realpathSync(targetRoot);
  const git = args =>
    execFileSync('/usr/bin/git', ['--no-replace-objects', '--git-dir', gitDir, ...args], {
      env: safeEnv,
      timeout: 30000,
      maxBuffer: 32 * 1024 * 1024,
    });
  const lines = git(['ls-tree', '-r', '-z', context.sourceCommit, '--', PREFIX, ...HELPERS])
    .toString('utf8')
    .split('\0')
    .filter(Boolean);
  const files = {};
  let total = 0;
  try {
    for (const line of lines) {
      const item = /^(100644|100755) blob ([a-f0-9]{40})\t(.+)$/u.exec(line);
      if (
        !item ||
        (!item[3].startsWith(PREFIX) && !HELPERS.includes(item[3])) ||
        item[3].split('/').some(x => !x || x === '.' || x === '..' || x.includes('\\'))
      )
        throw Error('Protected P2 tree entry');
      const bytes = git(['cat-file', 'blob', item[2]]);
      total += bytes.length;
      if (total > 64 * 1024 * 1024) throw Error('Protected P2 producer size cap');
      const file = path.join(root, item[3]);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, bytes, { flag: 'wx', mode: item[1] === '100755' ? 0o755 : 0o644 });
      files[item[3]] = {
        sha256: createHash('sha256').update(bytes).digest('hex'),
        bytes: bytes.length,
      };
    }
    if (
      HELPERS.some(f => !files[f]) ||
      !files[PREFIX + 'runtime.mjs'] ||
      !files[PREFIX + 'policy.json']
    )
      throw Error('Incomplete protected P2 producer');
    authenticateRuntimeContext(gitDir, context);
    return Object.freeze({
      root,
      sourceCommit: context.sourceCommit,
      sourceTree: context.sourceTree,
      files: Object.freeze(files),
      totalBytes: total,
      nativeAdmission: false,
    });
  } catch (error) {
    fs.rmSync(root, { recursive: true, force: true });
    throw error;
  }
}
