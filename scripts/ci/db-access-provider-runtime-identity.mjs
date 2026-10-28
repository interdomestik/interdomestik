import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import {
  decodeGitBlobBatch,
  gitBlobBatchRequest,
  MAX_GIT_BLOB_BATCH_BYTES,
} from './db-access-git-blob-batch.mjs';
import { execFileSync } from 'node:child_process';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');

const refuse = reason => {
  throw new Error('required provider runtime refused: ' + reason);
};

const safeEnv = {
  PATH: '/usr/bin:/bin',
  LANG: 'C.UTF-8',
  TZ: 'UTC',
  GIT_NO_REPLACE_OBJECTS: '1',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_GLOBAL: '/dev/null',
};

const sha = value => typeof value === 'string' && /^[a-f0-9]{40}$/u.test(value);

const snapshotReaders = new WeakMap();

function authenticateRuntimeContext(gitDir, context) {
  if (
    !context ||
    context.version !== 1 ||
    context.repository !== 'interdomestik/interdomestik' ||
    !['pull_request', 'push'].includes(context.eventName)
  )
    refuse('event identity');
  const keys = [
    'baseCommit',
    'headCommit',
    'candidateCommit',
    'candidateTree',
    'sourceCommit',
    'sourceTree',
    'protectedMain',
  ];
  if (keys.some(key => !sha(context[key]))) refuse('commit/tree identity');
  const git = args =>
    execFileSync('/usr/bin/git', ['--no-replace-objects', '--git-dir', gitDir, ...args], {
      env: safeEnv,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
      timeout: 30_000,
    }).trim();
  for (const name of [
    'baseCommit',
    'headCommit',
    'candidateCommit',
    'sourceCommit',
    'protectedMain',
  ])
    if (git(['cat-file', '-t', context[name]]) !== 'commit') refuse('noncommit ' + name);
  for (const [commit, tree] of [
    ['candidateCommit', 'candidateTree'],
    ['sourceCommit', 'sourceTree'],
  ])
    if (git(['rev-parse', context[commit] + '^{tree}']) !== context[tree])
      refuse('wrong tree ' + tree);
  if (git(['rev-parse', 'refs/protected/main']) !== context.protectedMain)
    refuse('protected main ref');
  git(['merge-base', '--is-ancestor', context.baseCommit, context.protectedMain]);
  if (
    !git([
      'for-each-ref',
      '--contains',
      context.sourceCommit,
      '--format=%(refname)',
      'refs/protected/',
    ])
  )
    refuse('source unreachable from authenticated origin refs');
  if (context.eventName === 'pull_request') {
    const parents = git(['show', '-s', '--format=%P', context.candidateCommit]).split(' ');
    if (
      parents.length !== 2 ||
      parents[0] !== context.baseCommit ||
      parents[1] !== context.headCommit
    )
      refuse('merge event parents');
  } else if (
    context.candidateCommit !== context.headCommit ||
    context.candidateCommit !== context.protectedMain
  ) {
    refuse('push event head');
  }
  // Capture the binary reader privately after authenticating this exact origin/event.
  // Writable properties on the returned function cannot replace snapshot readback.
  snapshotReaders.set(
    git,
    Object.freeze({
      commits: new Set([context.candidateCommit, context.sourceCommit]),
      metadata: (commit, files) =>
        execFileSync(
          '/usr/bin/git',
          [
            '--no-replace-objects',
            '--git-dir',
            gitDir,
            '--literal-pathspecs',
            'ls-tree',
            '-rz',
            commit,
            '--',
            ...files,
          ],
          { env: safeEnv, maxBuffer: MAX_GIT_BLOB_BATCH_BYTES, timeout: 30_000 }
        ),
      blobs: request =>
        execFileSync(
          '/usr/bin/git',
          ['--no-replace-objects', '--git-dir', gitDir, 'cat-file', '--batch'],
          { env: safeEnv, input: request, maxBuffer: MAX_GIT_BLOB_BATCH_BYTES, timeout: 30_000 }
        ),
    })
  );
  return git;
}

function exact(root, file, expected) {
  const full = path.join(root, file);
  if (
    file.startsWith('/') ||
    file.split('/').some(part => !part || ['.', '..'].includes(part) || part.includes('\\'))
  )
    refuse('input path');
  let current = root;
  for (const part of file.split('/')) {
    const matches = fs
      .readdirSync(current)
      .filter(name => name.normalize('NFC').toLowerCase() === part.normalize('NFC').toLowerCase());
    if (matches.length !== 1 || matches[0] !== part) refuse('ambiguous input ' + file);
    current = path.join(current, part);
    if (fs.lstatSync(current).isSymbolicLink()) refuse('symlink input ' + file);
  }
  const stat = fs.lstatSync(full),
    bytes = fs.readFileSync(full);
  if (
    !stat.isFile() ||
    fs.realpathSync(full) !== full ||
    bytes.length !== expected.bytes ||
    (stat.mode & 0o111 ? '100755' : '100644') !== expected.mode ||
    hash(bytes) !== expected.sha256
  )
    refuse('input identity ' + file);
  return bytes;
}

function snapshot(root, commit, records, git) {
  const reader = snapshotReaders.get(git);
  if (!reader || !reader.commits.has(commit)) refuse('unauthenticated Git snapshot reader');
  const entries = Object.entries(records);
  if (entries.length > 4096) refuse('Git blob batch snapshot record bound');
  const identities = {};
  let totalBytes = entries.length * 128;
  for (const [file, expected] of entries) {
    const bytes = exact(root, file, expected);
    totalBytes += bytes.length;
    if (totalBytes > MAX_GIT_BLOB_BATCH_BYTES) refuse('Git blob batch snapshot bound');
    identities[file] = hash(bytes);
  }
  if (!entries.length) return hash(JSON.stringify(identities));
  const requested = new Set(entries.map(([file]) => file));
  const tree = new Map();
  const listingBytes = reader.metadata(commit, [...requested]);
  const listing = listingBytes.toString('utf8');
  if (!Buffer.from(listing).equals(listingBytes))
    refuse('checkout/tree mismatch metadata encoding');
  const rows = listing.split('\0');
  if (rows.pop() !== '' || rows.some(row => !row))
    refuse('checkout/tree mismatch metadata framing');
  for (const row of rows) {
    const match = /^(100644|100755) blob ([a-f0-9]{40})\t([\s\S]+)$/u.exec(row);
    if (!match || !requested.has(match[3]) || tree.has(match[3]))
      refuse('checkout/tree mismatch batch membership');
    tree.set(match[3], { mode: match[1], oid: match[2] });
  }
  if (tree.size !== requested.size) refuse('checkout/tree mismatch missing path');
  const oids = [...new Set(entries.map(([file]) => tree.get(file).oid))];
  const blobs = decodeGitBlobBatch(reader.blobs(gitBlobBatchRequest(oids)), oids);
  for (const [file, expected] of entries) {
    const item = tree.get(file);
    if (item.mode !== expected.mode || hash(blobs.get(item.oid)) !== identities[file])
      refuse('checkout/tree mismatch ' + file);
  }
  return hash(JSON.stringify(identities));
}

export { hash, refuse, safeEnv, authenticateRuntimeContext, exact, snapshot };
