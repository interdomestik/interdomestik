// Bootstrap trust root: builtins only. Follow the protected workflow's Git/blob-before-import order.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = () => {
  throw Error('M4 compiled producer authentication refused');
};
const env = {
  PATH: '/usr/bin:/bin',
  GIT_NO_REPLACE_OBJECTS: '1',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_GLOBAL: '/dev/null',
  LANG: 'C',
  TZ: 'UTC',
};

export function readM4OwnedProducerFile(root, relative, expected) {
  if (
    !relative ||
    path.isAbsolute(relative) ||
    relative.split('/').some(p => !p || p === '.' || p === '..' || p.includes('\\'))
  )
    fail();
  let current = root;
  for (const part of relative.split('/')) {
    const matches = fs
      .readdirSync(current)
      .filter(n => n.normalize('NFC').toLowerCase() === part.normalize('NFC').toLowerCase());
    if (matches.length !== 1 || matches[0] !== part) fail();
    current = path.join(current, part);
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink() || stat.uid !== process.getuid() || stat.mode & 0o022) fail();
  }
  const fd = fs.openSync(current, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const before = fs.fstatSync(fd);
    if (
      !before.isFile() ||
      before.nlink !== 1 ||
      before.uid !== process.getuid() ||
      before.size > 32 * 1024 * 1024
    )
      fail();
    const bytes = fs.readFileSync(fd),
      after = fs.fstatSync(fd);
    if (
      ['dev', 'ino', 'size', 'mode', 'uid', 'mtimeMs', 'ctimeMs'].some(
        key => before[key] !== after[key]
      ) ||
      bytes.length !== expected.bytes ||
      hash(bytes) !== expected.sha256 ||
      (before.mode & 0o111 ? '100755' : '100644') !== expected.mode ||
      fs.realpathSync(current) !== current
    )
      fail();
    return bytes;
  } finally {
    fs.closeSync(fd);
  }
}

export function authenticateM4CompiledProducer({ producer, gitDir, context, deadlineAt }) {
  const remaining = () => {
    const ms = Math.floor(deadlineAt - performance.now());
    if (!(ms > 0 && ms <= 300000)) fail();
    return ms;
  };
  remaining();
  const root = fs.realpathSync(producer),
    rootStat = fs.lstatSync(root);
  if (
    root !== path.resolve(producer) ||
    !rootStat.isDirectory() ||
    rootStat.uid !== process.getuid() ||
    rootStat.mode & 0o022
  )
    fail();
  const git = args =>
    execFileSync('/usr/bin/git', ['--no-replace-objects', '--git-dir', gitDir, ...args], {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: Math.min(30000, remaining()),
      maxBuffer: 64 * 1024 * 1024,
    });
  const text = args => git(args).toString('utf8').trim();
  if (
    context?.version !== 1 ||
    context.repository !== 'interdomestik/interdomestik' ||
    !['pull_request', 'push'].includes(context.eventName)
  )
    fail();
  for (const key of [
    'baseCommit',
    'headCommit',
    'candidateCommit',
    'candidateTree',
    'sourceCommit',
    'sourceTree',
    'protectedMain',
  ])
    if (!/^[a-f0-9]{40}$/u.test(context[key] ?? '')) fail();
  for (const key of [
    'baseCommit',
    'headCommit',
    'candidateCommit',
    'sourceCommit',
    'protectedMain',
  ])
    if (text(['cat-file', '-t', context[key]]) !== 'commit') fail();
  for (const [commit, tree] of [
    ['candidateCommit', 'candidateTree'],
    ['sourceCommit', 'sourceTree'],
  ])
    if (text(['rev-parse', context[commit] + '^{tree}']) !== context[tree]) fail();
  if (text(['rev-parse', 'refs/protected/main']) !== context.protectedMain) fail();
  git(['merge-base', '--is-ancestor', context.baseCommit, context.protectedMain]);
  if (
    !text([
      'for-each-ref',
      '--contains',
      context.sourceCommit,
      '--format=%(refname)',
      'refs/protected/',
    ])
  )
    fail();
  if (context.eventName === 'pull_request') {
    if (
      text(['show', '-s', '--format=%P', context.candidateCommit]) !==
      context.baseCommit + ' ' + context.headCommit
    )
      fail();
  } else if (
    context.candidateCommit !== context.headCommit ||
    context.candidateCommit !== context.protectedMain
  )
    fail();
  const tree = new Map();
  for (const row of git(['ls-tree', '-rz', '--full-tree', context.sourceCommit])
    .toString('utf8')
    .split('\0')
    .filter(Boolean)) {
    const match = /^(100644|100755) blob ([a-f0-9]{40})\t(.+)$/u.exec(row);
    if (match) tree.set(match[3], { mode: match[1], oid: match[2] });
  }
  const blob = relative => {
    const item = tree.get(relative);
    if (!item) fail();
    return git(['cat-file', 'blob', item.oid]);
  };
  const policyFile = 'scripts/ci/db-access-provider-unit-policy.json';
  const policyBytes = blob(policyFile),
    policy = JSON.parse(policyBytes);
  if (policyBytes.length > 128 * 1024) fail();
  for (const [file, record] of Object.entries(policy.runtimeFiles ?? {}))
    if (
      policy.producerFiles?.[file] &&
      ['bytes', 'mode', 'sha256'].some(key => record[key] !== policy.producerFiles[file][key])
    )
      fail();
  const records = {
    ...policy.runtimeFiles,
    ...policy.producerFiles,
    [policyFile]: { bytes: policyBytes.length, sha256: hash(policyBytes), mode: '100644' },
  };
  const required = [
    'db-access-m4-compiled-producer-loader.mjs',
    'db-access-m4-compiled-producer-auth.mjs',
    'db-access-m4-compiled-runtime.mjs',
    'db-access-m4-compiled-runtime-contract.mjs',
    'db-access-m4-compiled-runtime-contract.json',
    'db-access-m4-worker-loader-contract.json',
  ];
  if (required.some(name => !records['scripts/ci/' + name]) || Object.keys(records).length > 4096)
    fail();
  for (const [relative, record] of Object.entries(records)) {
    const bytes = blob(relative);
    if (
      tree.get(relative).mode !== record.mode ||
      bytes.length !== record.bytes ||
      hash(bytes) !== record.sha256
    )
      fail();
    remaining();
    readM4OwnedProducerFile(root, relative, record);
  }
  const baseline = blob('scripts/ci/db-access-baseline.json');
  if (
    hash(baseline) !== '438b856b913d2946088b9c0f925dd07818b81ea82bad8d3468c2470a2f1131e9' ||
    JSON.parse(baseline).entries.length !== 604
  )
    fail();
  const contractFile = 'scripts/ci/db-access-m4-worker-loader-contract.json';
  const contract = JSON.parse(blob(contractFile)),
    dependency = contract.dependency;
  if (
    dependency.name !== 'typescript' ||
    dependency.version !== '5.9.3' ||
    Object.keys(dependency.files).length !== 132
  )
    fail();
  const lockBytes = blob(dependency.lockfile.path);
  if (
    hash(lockBytes) !== dependency.lockfile.sha256 ||
    policy.resolverFiles[dependency.lockfile.path]?.sha256 !== dependency.lockfile.sha256
  )
    fail();
  if (
    !contract.nodeRuntimes.some(
      row =>
        row.version === process.version &&
        row.platform === process.platform &&
        row.arch === process.arch &&
        row.executableSha256 === hash(fs.readFileSync(process.execPath))
    )
  )
    fail();
  const packageRoot = path.join(root, 'node_modules/typescript'),
    found = [];
  function walk(directory) {
    for (const name of fs.readdirSync(directory).sort()) {
      const full = path.join(directory, name),
        stat = fs.lstatSync(full);
      if (stat.isSymbolicLink() || stat.uid !== process.getuid() || stat.mode & 0o022) fail();
      if (stat.isDirectory()) walk(full);
      else if (stat.isFile()) found.push(path.relative(packageRoot, full));
      else fail();
    }
  }
  walk(packageRoot);
  if (JSON.stringify(found.sort()) !== JSON.stringify(Object.keys(dependency.files).sort())) fail();
  for (const [relative, record] of Object.entries(dependency.files)) {
    const file = 'node_modules/typescript/' + relative;
    remaining();
    readM4OwnedProducerFile(root, file, record);
    records[file] = record;
  }
  return {
    root,
    records,
    context: structuredClone(context),
    policySha256: hash(policyBytes),
    digest: hash(JSON.stringify({ context, records })),
  };
}
