import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { candidateSources, ROOT, SOURCE, resolverFile } from './db-access-trust.mjs';
import { inspectM4SessionAuthority } from './db-access-m4-session-authority.mjs';
import { authenticateRuntimeContext, hash } from './db-access-provider-runtime-identity.mjs';
import { outputShape, freezeOutput } from './db-access-output-binding.mjs';
import { runGit } from './db-access-git.mjs';
import { ADOPTION } from './db-access-adoption.mjs';

const generated = /(^|\/)(node_modules|dist|build|coverage|test-results|\.next|\.turbo)(\/|$)/u;
const skippedResolver = /(^|\/)(\.git|tmp|\.codex|\.agents)(\/|$)/u;
const sourcePath = file => ROOT.test(file) && SOURCE.test(file) && !generated.test(file);
const resolverPath = file =>
  resolverFile(file) && !generated.test(file) && !skippedResolver.test(file);
const fail = reason => {
  throw Error('incomplete: M4 native event ' + reason);
};

// Native historical preparation uses Git -C; reject ambient parent discovery.
// The authenticated event repository and this worktree have distinct roles.
export function assertM4NativeGitRoot(repoRoot, event) {
  const root = fs.realpathSync(repoRoot);
  const git = args =>
    runGit(['--no-replace-objects', '-C', root, ...args])
      .toString()
      .trim();
  if (
    !fs.existsSync(path.join(root, '.git')) ||
    fs.realpathSync(git(['rev-parse', '--show-toplevel'])) !== root
  )
    fail('requires an explicit native Git worktree');
  if (git(['rev-parse', 'HEAD']) !== event.context.candidateCommit)
    fail('native worktree HEAD/event mismatch');
  if (git(['show', '-s', '--format=%T', ADOPTION.commit]) !== ADOPTION.tree)
    fail('native historical adoption objects');
}

// Plain derived data only. Only the live-session owner retains this result as a
// private bookend; calling this helper cannot create native/runtime ownership.
export function inspectM4NativeEvent(prepared, event) {
  outputShape(event); // Reject getters, functions, exotic prototypes and cycles before reads.
  const git = authenticateRuntimeContext(event.gitDir, event.context);
  assertM4NativeGitRoot(prepared.repoRoot, event);
  const authority = inspectM4SessionAuthority(prepared);
  const sources = candidateSources(prepared.repoRoot);
  const modeled = [...prepared.model.sources.keys()].filter(sourcePath).sort();
  if (JSON.stringify([...sources.keys()].sort()) !== JSON.stringify(modeled))
    fail('source membership');
  for (const [file, text] of sources)
    if (prepared.model.sources.get(file) !== text) fail('source/model bytes ' + file);

  const tree = new Map();
  const folded = new Set();
  for (const row of git(['ls-tree', '-rz', event.context.candidateTree])
    .split('\0')
    .filter(Boolean)) {
    const match = /^(\d{6}) (\w+) ([a-f0-9]{40})\t([\s\S]+)$/u.exec(row);
    if (!match) fail('tree record');
    const [, mode, kind, oid, file] = match;
    if (!sourcePath(file) && !resolverPath(file) && !authority.candidateFiles.includes(file))
      continue;
    if (
      file.startsWith('/') ||
      file.split('/').some(part => !part || ['.', '..'].includes(part) || part.includes('\\'))
    )
      fail('tree path');
    const key = file.normalize('NFC').toLowerCase();
    if (folded.has(key) || kind !== 'blob' || !['100644', '100755'].includes(mode))
      fail('tree type/path alias');
    folded.add(key);
    tree.set(file, { mode, oid });
  }
  const files = [...new Set([...sources.keys(), ...authority.candidateFiles])].sort();
  if (JSON.stringify(files) !== JSON.stringify([...tree.keys()].sort()))
    fail('checkout/tree membership');
  const records = [];
  const root = fs.realpathSync(prepared.repoRoot);
  for (const file of files) {
    const full = path.join(root, file);
    let current = root;
    for (const part of file.split('/')) {
      current = path.join(current, part);
      if (fs.lstatSync(current).isSymbolicLink()) fail('symlink ' + file);
    }
    const stat = fs.lstatSync(full);
    if (!stat.isFile() || fs.realpathSync(full) !== full) fail('nonregular ' + file);
    const bytes = fs.readFileSync(full);
    if (sources.has(file) && bytes.toString('utf8') !== sources.get(file))
      fail('source changed ' + file);
    const mode = stat.mode & 0o111 ? '100755' : '100644';
    // Git SHA-1 object identity authenticates exact raw bytes without spawning or
    // retaining a second full-tree blob materialization. Context requires SHA-1 IDs.
    const oid = createHash('sha1')
      .update('blob ' + bytes.length + '\0')
      .update(bytes)
      .digest('hex');
    const expected = tree.get(file);
    if (mode !== expected.mode || oid !== expected.oid) fail('checkout/tree bytes or mode ' + file);
    records.push([file, mode, bytes.length, hash(bytes), oid]);
  }
  return freezeOutput({
    version: 1,
    contextSha256: hash(JSON.stringify(event.context)),
    candidateTree: event.context.candidateTree,
    authorityDigest: authority.digest,
    inputCount: records.length,
    inputDigest: outputShape(records).digest,
    deploymentImageComplete: false,
    allExecutableContextsQualified: false,
    nativeAdmission: false,
  });
}
