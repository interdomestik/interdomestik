// Authenticated source/candidate byte snapshots and fixed qualification capsule validation.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { exact, safeEnv } from '../db-access-provider-runtime-identity.mjs';
import { P2_SOURCE, LEGACY_P2_SOURCE } from './source-fence.mjs';
const PREFIX = 'scripts/ci/p2/',
  WRAPPER = 'apps/web/src/server/operations/m4-qualification-admin-assignment.ts',
  RELAY = 'apps/web/src/server/operations/m4-assignment-relay.ts';
const digest = value => createHash('sha256').update(value).digest('hex');
const fail = reason => {
  throw Error('required P2 source refused: ' + reason);
};
function record(bytes, mode = '100644') {
  return { bytes: bytes.length, sha256: digest(bytes), mode };
}
function gitBytes(gitDir, args) {
  return execFileSync('/usr/bin/git', ['--no-replace-objects', '--git-dir', gitDir, ...args], {
    env: safeEnv,
    maxBuffer: 32 * 1024 * 1024,
    timeout: 30000,
  });
}
export function sourceSnapshot(producerRoot, gitDir, context) {
  const listed = gitBytes(gitDir, ['ls-tree', '-r', '-z', context.sourceCommit, '--', PREFIX])
    .toString('utf8')
    .split('\0')
    .filter(Boolean);
  const records = {};
  for (const line of listed) {
    const match = /^(100644|100755) blob ([a-f0-9]{40})\t(.+)$/u.exec(line);
    if (!match || !match[3].startsWith(PREFIX)) fail('producer tree kind');
    const bytes = gitBytes(gitDir, ['cat-file', 'blob', match[2]]);
    records[match[3]] = record(bytes, match[1]);
    exact(producerRoot, match[3], records[match[3]]);
  }
  if (!records[PREFIX + 'runtime.mjs'] || !records[PREFIX + 'policy.json'])
    fail('missing fixed producer');
  const actual = [],
    directories = [];
  const walk = relative => {
    for (const name of fs.readdirSync(path.join(producerRoot, relative))) {
      const file = relative + name;
      const st = fs.lstatSync(path.join(producerRoot, file));
      if (st.isSymbolicLink()) fail('producer symlink');
      if (st.isDirectory()) {
        directories.push(file + '/');
        walk(file + '/');
      } else if (st.isFile()) actual.push(file);
      else fail('producer filesystem kind');
    }
  };
  walk(PREFIX);
  if (JSON.stringify(actual.sort()) !== JSON.stringify(Object.keys(records).sort()))
    fail('producer exact file set');
  const expectedDirectories = new Set();
  for (const file of Object.keys(records)) {
    let directory = path.posix.dirname(file) + '/';
    while (directory !== PREFIX) {
      expectedDirectories.add(directory);
      directory = path.posix.dirname(directory.slice(0, -1)) + '/';
    }
  }
  if (JSON.stringify(directories.sort()) !== JSON.stringify([...expectedDirectories].sort()))
    fail('producer exact directory set');
  return { records, sha256: digest(JSON.stringify(records)) };
}
export function candidateSnapshot(candidateRoot, gitDir, context, policy) {
  if (
    JSON.stringify(Object.keys(policy.sourceFiles).sort()) !==
    JSON.stringify(
      [
        P2_SOURCE,
        WRAPPER,
        RELAY,
        LEGACY_P2_SOURCE,
        'apps/web/src/actions/admin-claims/assign.core.ts',
      ].sort()
    )
  )
    fail('widened source policy');
  const result = {};
  for (const file of Object.keys(policy.sourceFiles)) {
    const bytes = gitBytes(gitDir, ['show', context.candidateCommit + ':' + file]);
    if (digest(bytes) !== policy.sourceFiles[file])
      fail('candidate source requires reviewed capsule update');
    exact(candidateRoot, file, record(bytes));
    result[file] = digest(bytes);
  }
  for (const [file, expected] of Object.entries(policy.dispatchFiles)) {
    const bytes = gitBytes(gitDir, ['show', context.candidateCommit + ':' + file]);
    if (digest(bytes) !== expected) fail('ordinary dispatch configuration drift');
    exact(candidateRoot, file, record(bytes));
    result[file] = digest(bytes);
  }
  return digest(JSON.stringify(result));
}
export function validateCapsule(root, policy) {
  const oracle = JSON.parse(fs.readFileSync(path.join(root, 'dist/source-manifest.json')));
  if (
    JSON.stringify(oracle.sourceFiles) !==
      JSON.stringify(
        Object.fromEntries(
          [P2_SOURCE, WRAPPER, RELAY].map(file => [file, policy.sourceFiles[file]])
        )
      ) ||
    oracle.tests.length !== 10 ||
    oracle.mockSpecifiers.length !== 2
  )
    fail('closed capsule oracle');
  for (const [file, name] of [
    [P2_SOURCE, 'wrapper.test'],
    [WRAPPER, 'wrapper'],
    [RELAY, 'relay'],
  ]) {
    const original = fs.readFileSync(
      path.join(root, 'capsule', 'dist', name + '.original.ts'),
      'utf8'
    );
    const generated = fs.readFileSync(
      path.join(root, 'capsule', 'dist', name + '.source.ts'),
      'utf8'
    );
    if (digest(original) !== policy.sourceFiles[file]) fail('capsule original bytes');
    for (const segment of oracle.retainedSegments.filter(s => s.file === file)) {
      const actual = original.slice(segment.start, segment.end);
      if (
        digest(actual) !== segment.sha256 ||
        generated.slice(segment.generatedStart, segment.generatedEnd) !== actual
      )
        fail('retained source segment');
    }
  }
  return oracle;
}
