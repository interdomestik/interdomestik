import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { canonicalJson, compareText, sha256 } from './slice-rehearse-canonical.mjs';
import {
  capacityOwnerDeltasFromFacts,
  collectTrackedFacts,
  collectWriterFactsAtBase,
} from './slice-rehearse-capacity-owner-facts.mjs';
import {
  gitAncestry,
  gitCurrentBranch,
  normalizeGitHubOrigin,
} from './slice-rehearse-repository-facts.mjs';
import {
  assertLocalAnchor,
  GIT_BIN,
  GIT_OPTIONS,
  GIT_READ_PREFIX,
  gitBytes,
  gitText,
  readLocalAnchor,
  observeLocalFile,
  SAFE_EXEC_ENV,
} from './slice-rehearse-bootstrap.mjs';
export { gitBytes, gitText } from './slice-rehearse-bootstrap.mjs';
const TEXT_OPTIONS = Object.freeze({ ...GIT_OPTIONS, encoding: 'utf8' });
export function inspectOptionalRef(repository, ref, run = spawnSync) {
  if (!/^refs\/heads\/[A-Za-z0-9._/-]+$/u.test(ref)) throw new Error('optional ref is invalid');
  const result = run(
    GIT_BIN,
    [...GIT_READ_PREFIX, '-C', repository, 'show-ref', '--verify', '--hash', ref],
    { ...TEXT_OPTIONS, timeout: 2_000 }
  );
  if (result.status === 1 && !result.stdout?.trim() && !result.stderr?.trim()) return 'absent';
  if (result.status !== 0 || !/^[0-9a-f]{40}$/u.test(result.stdout?.trim() ?? '')) {
    throw new Error(result.stderr?.trim() || 'optional ref evidence failed');
  }
  return result.stdout.trim();
}
function gitResult(repository, args) {
  return spawnSync(GIT_BIN, [...GIT_READ_PREFIX, '-C', repository, ...args], TEXT_OPTIONS);
}
function dirtyPaths(repository) {
  const output = gitBytes(repository, ['status', '--porcelain=v1', '-z', '--untracked-files=all']);
  const records = output.toString('utf8').split('\0').filter(Boolean);
  const paths = [];
  for (let index = 0; index < records.length; index++) {
    const record = records[index];
    const status = record.slice(0, 2);
    paths.push(record.slice(3));
    if (/[RC]/u.test(status)) paths.push(records[++index]);
  }
  return [...new Set(paths)].sort(compareText);
}
function protectedMain(repository, protectedMainSha) {
  if (!/^[0-9a-f]{40}$/u.test(protectedMainSha ?? '')) {
    throw new Error('Verified protected-main authority evidence is unavailable.');
  }
  assertCommit(repository, protectedMainSha, 'Protected-main anchor');
  return protectedMainSha;
}
function changedPaths(repository, range) {
  const output = gitBytes(repository, [
    'diff',
    '--name-status',
    '-z',
    '--find-renames',
    range,
    '--',
  ]);
  const records = output.toString('utf8').split('\0').filter(Boolean);
  const paths = [];
  for (let index = 0; index < records.length;) {
    const status = records[index++];
    if (!/^(?:[ACDMRTUXB]|R\d{1,3}|C\d{1,3})$/u.test(status)) {
      throw new Error(`Committed changed-path evidence is malformed: ${status}`);
    }
    const pathCount = /^[RC]/u.test(status) ? 2 : 1;
    if (index + pathCount > records.length) {
      throw new Error('Committed changed-path evidence is truncated.');
    }
    paths.push(...records.slice(index, index + pathCount));
    index += pathCount;
  }
  return [...new Set(paths)].sort(compareText);
}

function assertVisibleWriters(repository, writerPaths) {
  if (!writerPaths.length) return;
  const records = gitBytes(repository, ['ls-files', '-v', '-z', '--', ...writerPaths])
    .toString('utf8')
    .split('\0')
    .filter(Boolean);
  const hidden = records
    .filter(record => /^(?:[a-z]|S) /u.test(record))
    .map(record => record.slice(2));
  if (hidden.length) throw new Error(`Writer path has hidden index state: ${hidden[0]}`);
}

function assertCommit(repository, baseSha, label = 'Manifest base') {
  const result = gitResult(repository, ['cat-file', '-e', `${baseSha}^{commit}`]);
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `${label} commit is unavailable: ${baseSha}`);
  }
}

function localIndex(repository) {
  const sparse = gitResult(repository, [
    'config',
    '--bool',
    '--default=false',
    '--get',
    'core.sparseCheckout',
  ]);
  if (sparse.status !== 0 || sparse.stdout.trim() !== 'false') {
    throw new Error('Local observation unsupported sparse or unavailable index state.');
  }
  const read = args => {
    const bytes = gitBytes(repository, args);
    const text = bytes.toString('utf8');
    if (!Buffer.from(text).equals(bytes))
      throw new Error('Local observation unsupported Git encoding.');
    return text;
  };
  const index = read(['ls-files', '--stage', '-v', '-z']);
  const records = index.split('\0').filter(Boolean);
  if (records.length > 10_000) throw new Error('Local observation unsupported index size.');
  const paths = records.map(record => {
    const entry = /^H (100644|100755) ([0-9a-f]{40}) 0\t([^\0]+)$/u.exec(record);
    if (!entry)
      throw new Error(
        'Local observation unsupported hidden index state or unmerged index; tracked path is not a regular file.'
      );
    return entry[3];
  });
  // ITA and staged empty files have the same ls-files OID; invisible diff distinguishes them.
  const staged = read([
    'diff',
    '--cached',
    '--ita-invisible-in-index',
    '--raw',
    '-z',
    '--no-renames',
    'HEAD',
    '--',
  ]);
  const dirty = read(['status', '--porcelain=v1', '-z', '--untracked-files=all']);
  return { paths, signature: sha256(JSON.stringify([index, staged, dirty])) };
}

// Internal v1 bytes only; deliberately not canonicalJson/legacy receipt encoding.
// All tracked bytes close the local capacity dependency set. No remote/ref/cleanup
// registry atomicity or mutation authority is implied by an equal observation.
export function observeLocalState(repository, extraPaths = []) {
  repository = realpathSync(repository);
  const before = localIndex(repository);
  const paths = [
    ...new Set([
      ...before.paths,
      ...extraPaths,
      'scripts/repo-size-budget.json',
      'docs/plans/current-program.md',
      'docs/plans/current-tracker.md',
    ]),
  ].sort(compareText);
  if (paths.length > 10_000) throw new Error('Local observation unsupported dependency count.');
  let total = 0;
  const files = paths.map(file => {
    const state = observeLocalFile(repository, file);
    if (!state && before.paths.includes(file))
      throw new Error('Local observation unsupported missing tracked file.');
    total += state?.[3] ?? 0;
    if (total > 128 * 1024 * 1024)
      throw new Error('Local observation unsupported total byte bound.');
    return [file, state];
  });
  if (localIndex(repository).signature !== before.signature)
    throw new Error('Local observation changed during collection.');
  return sha256(JSON.stringify(['interdomestik.local-observation', 1, before.signature, files]));
}

export function assertLocalObservation(repository, paths, expected) {
  if (observeLocalState(repository, paths) !== expected)
    throw new Error('Local observation changed.');
}

export function collectRepositoryFacts({
  cwd,
  baseSha,
  budgetBaselineSha = baseSha,
  capacityOwnerPaths = [],
  protectedMainSha,
  writerPaths = [],
}) {
  const anchor = readLocalAnchor(cwd);
  const { root, headSha, treeSha } = anchor;
  const observationPaths = [...writerPaths, ...capacityOwnerPaths, 'scripts/repo-size-budget.json'];
  const observation = observeLocalState(root, observationPaths);
  const verifiedProtectedMainSha = protectedMain(root, protectedMainSha);
  const identity = normalizeGitHubOrigin(gitText(root, ['config', '--get', 'remote.origin.url']));
  const mergeBaseSha = gitText(root, ['merge-base', verifiedProtectedMainSha, headSha]);
  const dirty = dirtyPaths(root);
  assertVisibleWriters(root, writerPaths);
  const manifestFacts = collectWriterFactsAtBase({
    repository: root,
    baseSha,
    writerPaths,
    gitBytes,
    assertCommit,
  });
  const writerFacts = Object.fromEntries(
    Object.entries(manifestFacts).map(([filePath, facts]) => [
      filePath,
      {
        currentBytes: facts.currentBytes,
        currentExists: facts.currentExists,
        currentSha256: facts.currentSha256,
        manifestBaseBytes: facts.baseBytes,
        manifestBaseExists: facts.baseExists,
      },
    ])
  );
  const capacityFacts =
    budgetBaselineSha === baseSha
      ? manifestFacts
      : collectWriterFactsAtBase({
          repository: root,
          baseSha: budgetBaselineSha,
          writerPaths,
          gitBytes,
          assertCommit,
        });
  const writerDeltas = Object.fromEntries(
    Object.entries(capacityFacts).map(([filePath, facts]) => [
      filePath,
      {
        bytes: Math.max(0, facts.currentBytes - facts.baseBytes),
        baseBytes: facts.baseBytes,
        currentBytes: facts.currentBytes,
        currentSha256: facts.currentSha256,
        files: Number(facts.currentExists && !facts.baseExists),
        capacityBaselineExists: facts.baseExists,
        manifestBaseExists: manifestFacts[filePath].baseExists,
        currentExists: facts.currentExists,
      },
    ])
  );
  const facts = {
    root,
    origin: identity.origin,
    providerRepository: identity.providerRepository,
    headSha,
    treeSha,
    baseSha,
    baseIsAncestor: gitAncestry(gitResult, root, baseSha, headSha),
    capacityBaseSha: budgetBaselineSha,
    protectedMainSha: verifiedProtectedMainSha,
    mergeBaseSha,
    branch: gitCurrentBranch(gitResult, root),
    committedChangedPaths: changedPaths(root, `${verifiedProtectedMainSha}...${headSha}`),
    protectedMainAdvancedPaths: changedPaths(root, `${mergeBaseSha}..${verifiedProtectedMainSha}`),
    dirtyPaths: dirty,
    dirtyWriterPaths: dirty.filter(filePath => writerPaths.includes(filePath)),
    capacityOwnerDeltas: capacityOwnerDeltasFromFacts(
      collectWriterFactsAtBase({
        repository: root,
        baseSha: budgetBaselineSha,
        writerPaths: capacityOwnerPaths,
        gitBytes,
        assertCommit,
      })
    ),
    tracked: collectTrackedFacts(root, { gitBin: GIT_BIN, env: SAFE_EXEC_ENV }),
    writerLineCounts: Object.fromEntries(
      Object.entries(manifestFacts).map(([filePath, facts]) => [filePath, facts.currentLines])
    ),
    writerFacts,
    writerFactsDigest: sha256(canonicalJson(writerFacts)),
    writerDeltas,
  };
  assertLocalAnchor(root, anchor);
  assertLocalObservation(root, observationPaths, observation);
  return facts;
}
