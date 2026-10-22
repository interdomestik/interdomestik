import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
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
  const identities = {};
  for (const [file, expected] of Object.entries(records)) {
    const bytes = exact(root, file, expected);
    const item = git(['ls-tree', commit, '--', file]);
    const match = /^(100644|100755) blob ([a-f0-9]{40})\t(.+)$/u.exec(item);
    if (
      !match ||
      match[1] !== expected.mode ||
      match[3] !== file ||
      hash(git.readBlob(match[2])) !== hash(bytes)
    )
      refuse('checkout/tree mismatch ' + file);
    identities[file] = hash(bytes);
  }
  return hash(JSON.stringify(identities));
}

export { hash, refuse, safeEnv, authenticateRuntimeContext, exact, snapshot };
