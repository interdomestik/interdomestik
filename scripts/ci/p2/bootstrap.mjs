// Entry must itself be loaded from the workflow's authenticated fixed producer.
// Builtins only until the complete materialized producer has been authenticated.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PREFIX = 'scripts/ci/p2/';
const HELPERS = [
  'scripts/ci/db-access-provider-runtime-identity.mjs',
  'scripts/ci/coverage-gate.mjs',
  'scripts/ci/clean-coverage-artifacts.mjs',
];
const invocations = new WeakMap();
const results = new WeakMap();
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = reason => {
  throw Error('P2 trusted bootstrap refused: ' + reason);
};
const safeEnv = {
  PATH: '/usr/bin:/bin',
  LANG: 'C.UTF-8',
  TZ: 'UTC',
  GIT_NO_REPLACE_OBJECTS: '1',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_GLOBAL: '/dev/null',
};
function git(gitDir, args) {
  return execFileSync('/usr/bin/git', ['--no-replace-objects', '--git-dir', gitDir, ...args], {
    env: safeEnv,
    timeout: 30000,
    maxBuffer: 32 * 1024 * 1024,
  });
}
function exact(root, file, mode, bytes) {
  if (
    path.isAbsolute(file) ||
    file.includes('\\') ||
    file.includes('\0') ||
    file.split('/').some(part => !part || part === '.' || part === '..')
  )
    fail('producer path');
  let current = root;
  for (const part of file.split('/')) {
    const names = fs
      .readdirSync(current)
      .filter(name => name.normalize('NFC').toLowerCase() === part.normalize('NFC').toLowerCase());
    if (names.length !== 1 || names[0] !== part) fail('ambiguous producer path');
    current = path.join(current, part);
    if (fs.lstatSync(current).isSymbolicLink()) fail('producer symlink');
  }
  const stat = fs.lstatSync(current);
  if (
    !stat.isFile() ||
    fs.realpathSync(current) !== current ||
    (stat.mode & 0o111 ? '100755' : '100644') !== mode ||
    !fs.readFileSync(current).equals(bytes)
  )
    fail('producer input identity ' + file);
}
function snapshot(producerRoot, gitDir, context) {
  if (context.eventName !== 'pull_request') fail('pull_request event required');
  if (
    context.repository !== 'interdomestik/interdomestik' ||
    !/^[a-f0-9]{40}$/u.test(context.sourceCommit ?? '') ||
    !/^[a-f0-9]{40}$/u.test(context.sourceTree ?? '')
  )
    fail('fixed source identity');
  if (
    git(gitDir, ['cat-file', '-t', context.sourceCommit]).toString().trim() !== 'commit' ||
    git(gitDir, ['rev-parse', context.sourceCommit + '^{tree}'])
      .toString()
      .trim() !== context.sourceTree ||
    !git(gitDir, [
      'for-each-ref',
      '--contains',
      context.sourceCommit,
      '--format=%(refname)',
      'refs/protected/',
    ])
      .toString()
      .trim()
  )
    fail('unprotected source commit/tree');
  const listing = git(gitDir, [
    'ls-tree',
    '-r',
    '-z',
    context.sourceCommit,
    '--',
    PREFIX,
    ...HELPERS,
  ]).toString('utf8');
  const records = Object.create(null);
  for (const row of listing.split('\0').filter(Boolean)) {
    const match = /^(100644|100755) blob ([a-f0-9]{40})\t(.+)$/u.exec(row);
    if (!match || !(match[3].startsWith(PREFIX) || HELPERS.includes(match[3])))
      fail('producer tree kind/path');
    const bytes = git(gitDir, ['cat-file', 'blob', match[2]]);
    exact(producerRoot, match[3], match[1], bytes);
    records[match[3]] = { mode: match[1], bytes: bytes.length, sha256: hash(bytes) };
  }
  for (const required of [
    ...HELPERS,
    PREFIX + 'bootstrap.mjs',
    PREFIX + 'ordinary-artifact.mjs',
    PREFIX + 'ordinary-dispatch.mjs',
    PREFIX + 'unpack-ordinary.py',
  ])
    if (!records[required]) fail('incomplete producer closure');
  const expectedDirectories = new Set();
  for (const file of Object.keys(records)) {
    let parent = path.posix.dirname(file);
    while (parent !== '.') {
      expectedDirectories.add(parent);
      parent = path.posix.dirname(parent);
    }
  }
  const actual = [],
    directories = [];
  function walk(relative = '') {
    for (const name of fs.readdirSync(path.join(producerRoot, relative))) {
      const file = relative ? relative + '/' + name : name;
      const stat = fs.lstatSync(path.join(producerRoot, file));
      if (stat.isSymbolicLink()) fail('producer symlink');
      if (stat.isDirectory()) {
        directories.push(file);
        walk(file);
      } else if (stat.isFile()) actual.push(file);
      else fail('producer filesystem kind');
    }
  }
  walk();
  if (
    JSON.stringify(actual.sort()) !== JSON.stringify(Object.keys(records).sort()) ||
    JSON.stringify(directories.sort()) !== JSON.stringify([...expectedDirectories].sort())
  )
    fail('producer complete filesystem census');
  return hash(JSON.stringify(records));
}

// No public token-minting API: only this entry can create the private invocation.
export async function runBootstrappedP2Coverage(givenOptions) {
  if (givenOptions?.context?.eventName !== 'pull_request') fail('pull_request event required');
  const options = Object.freeze({
    ...givenOptions,
    context: Object.freeze(structuredClone(givenOptions.context)),
  });
  const { producerRoot, candidateRoot, outputRoot, gitDir, context } = options;
  const roots = [producerRoot, candidateRoot, outputRoot].map(root => fs.realpathSync(root));
  if (
    [producerRoot, candidateRoot, outputRoot].some((root, i) => root !== roots[i]) ||
    roots.some((root, i) =>
      roots.some((other, j) => i !== j && (root === other || root.startsWith(other + path.sep)))
    )
  )
    fail('disjoint canonical authority roots required');
  if (fileURLToPath(import.meta.url) !== path.join(producerRoot, PREFIX, 'bootstrap.mjs'))
    fail('bootstrap loaded outside fixed producer');
  const before = snapshot(producerRoot, gitDir, context);
  // These imports occur only after all P2 bytes and all three extra helpers pass.
  const identity = await import(pathToFileURL(path.join(producerRoot, HELPERS[0])).href);
  identity.authenticateRuntimeContext(gitDir, context);
  const dispatch = await import(
    pathToFileURL(path.join(producerRoot, PREFIX, 'ordinary-dispatch.mjs')).href
  );
  const assertCurrent = () => {
    identity.authenticateRuntimeContext(gitDir, context);
    if (snapshot(producerRoot, gitDir, context) !== before) fail('producer closure changed');
  };
  invocations.set(options, { assertCurrent });
  try {
    const result = await dispatch.runRequiredP2Coverage(options);
    assertCurrent();
    results.set(result, {
      assertCurrent,
      context: JSON.stringify(context),
      join: dispatch.takeFreshP2CoverageForJoin,
    });
    return result;
  } finally {
    invocations.delete(options);
  }
}

export function takeP2BootstrapInvocation(options) {
  const state = invocations.get(options);
  if (!state) fail('private authenticated invocation required');
  invocations.delete(options);
  state.assertCurrent();
  return state;
}

export function takeBootstrappedP2CoverageForJoin(result, context) {
  if (context?.eventName !== 'pull_request') fail('pull_request event required');
  const state = results.get(result);
  if (!state || state.context !== JSON.stringify(context))
    fail('fresh bootstrapped result required');
  results.delete(result);
  state.assertCurrent();
  return state.join(result, context);
}
