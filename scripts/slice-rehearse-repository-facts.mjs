import { CAPACITY_CATEGORIES } from './repo-size-capacity-schema.mjs';
import {
  must,
  normalizeGitHubOrigin,
  safeRelativePath,
  sha256,
  sortedUnique,
} from './slice-rehearse-canonical.mjs';

const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/u;
function safePaths(values, label) {
  return sortedUnique(values, label, safeRelativePath);
}
function nonnegativeInteger(value, label) {
  must(Number.isSafeInteger(value) && value >= 0, `${label} is invalid`);
}

export { normalizeGitHubOrigin } from './slice-rehearse-canonical.mjs';

export function exactGitHubRepository(value, origin) {
  return value?.full_name === origin && Number.isSafeInteger(value.id) && value.id > 0;
}

export function exactTimestamp(value) {
  const parsed = Date.parse(value);
  return typeof value === 'string' && Number.isFinite(parsed) ? parsed : null;
}

export function exactSuccessfulRunner(jobs, now, options) {
  must(Array.isArray(jobs) && jobs.length <= options.maxJobs, 'GitHub job inventory is invalid');
  const matches = jobs.filter(job => job?.name === options.runnerName);
  if (matches.length !== 1) return null;
  const runner = matches[0];
  const completedAt = exactTimestamp(runner.completed_at);
  const age = completedAt === null ? Number.POSITIVE_INFINITY : now - completedAt;
  const valid =
    Number.isSafeInteger(runner.id) &&
    runner.id > 0 &&
    runner.status === 'completed' &&
    runner.conclusion === 'success' &&
    age >= -options.futureToleranceMs &&
    age <= options.maxAgeMs;
  return valid ? runner : null;
}

export function gitAncestry(gitResult, repository, baseSha, headSha) {
  const result = gitResult(repository, ['merge-base', '--is-ancestor', baseSha, headSha]);
  if (result.status === 0) return true;
  if (result.status === 1) return false;
  throw new Error(result.stderr.trim() || 'Unable to verify base ancestry.');
}

export function gitCurrentBranch(gitResult, repository) {
  const result = gitResult(repository, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
  if (result.status === 0) return result.stdout.trim();
  if (result.status === 1) return 'HEAD';
  throw new Error(result.stderr.trim() || 'Unable to read the current branch.');
}

export function exactPullRequest(pull, headSha, origin) {
  return (
    Number.isSafeInteger(pull?.id) &&
    pull.id > 0 &&
    Number.isSafeInteger(pull?.number) &&
    pull.number > 0 &&
    pull.state === 'open' &&
    pull.base?.ref === 'main' &&
    exactGitHubRepository(pull.base?.repo, origin) &&
    exactGitHubRepository(pull.head?.repo, origin) &&
    pull.base.repo.id === pull.head.repo.id &&
    pull.head?.sha === headSha
  );
}

export function readGitBlobDigest(repository, commitSha, filePath, maxBytes, readGitBytes) {
  must(SHA_PATTERN.test(commitSha), 'Git blob commit SHA is invalid');
  const bytes = readGitBytes(repository, ['show', `${commitSha}:${filePath}`]);
  must(Buffer.isBuffer(bytes), 'Git blob evidence is invalid');
  must(bytes.byteLength > 0 && bytes.byteLength <= maxBytes, 'Git blob evidence is invalid');
  return sha256(bytes);
}

export { repositoryAuthorityStops } from './slice-rehearse-writer-policy.mjs';

export function normalizeRepositoryFacts(repository) {
  must(repository && typeof repository === 'object', 'repository facts are required');
  for (const key of [
    'root',
    'origin',
    'headSha',
    'treeSha',
    'baseSha',
    'capacityBaseSha',
    'protectedMainSha',
    'mergeBaseSha',
    'branch',
  ]) {
    must(typeof repository[key] === 'string' && repository[key], `repository ${key} is invalid`);
  }
  for (const key of [
    'headSha',
    'treeSha',
    'baseSha',
    'capacityBaseSha',
    'protectedMainSha',
    'mergeBaseSha',
  ]) {
    must(SHA_PATTERN.test(repository[key]), `repository ${key} is invalid`);
  }
  const identity = normalizeGitHubOrigin(repository.origin);
  if (repository.providerRepository !== undefined) {
    must(
      repository.providerRepository === identity.providerRepository,
      'repository provider identity is inconsistent'
    );
  }
  must(typeof repository.baseIsAncestor === 'boolean', 'repository ancestry fact is invalid');
  must(repository.tracked && typeof repository.tracked === 'object', 'tracked facts are required');
  nonnegativeInteger(repository.tracked.files, 'tracked file count');
  nonnegativeInteger(repository.tracked.bytes, 'tracked byte count');
  must(
    repository.tracked.categoryBytes && typeof repository.tracked.categoryBytes === 'object',
    'tracked category facts are invalid'
  );
  for (const category of CAPACITY_CATEGORIES) {
    nonnegativeInteger(
      repository.tracked.categoryBytes[category] ?? 0,
      `tracked ${category} bytes`
    );
  }
  const writerLineCounts = repository.writerLineCounts ?? {};
  const writerDeltas = repository.writerDeltas ?? {};
  const capacityOwnerDeltas = repository.capacityOwnerDeltas ?? {};
  must(
    Object.values(writerLineCounts).every(lines => Number.isSafeInteger(lines) && lines >= 0),
    'writer line count is invalid'
  );
  const normalizedDeltas = Object.fromEntries(
    Object.entries(writerDeltas).map(([path, delta]) => {
      const capacityBaselineExists = delta?.capacityBaselineExists ?? delta?.baselineExists;
      const manifestBaseExists = delta?.manifestBaseExists ?? delta?.baselineExists;
      must(
        delta &&
          Number.isSafeInteger(delta.bytes) &&
          delta.bytes >= 0 &&
          Number.isSafeInteger(delta.currentBytes) &&
          delta.currentBytes >= 0 &&
          ((delta.currentExists === true && DIGEST_PATTERN.test(delta.currentSha256 ?? '')) ||
            (delta.currentExists === false && delta.currentSha256 === null)) &&
          [0, 1].includes(delta.files) &&
          typeof capacityBaselineExists === 'boolean' &&
          typeof manifestBaseExists === 'boolean' &&
          typeof delta.currentExists === 'boolean',
        'writer delta is invalid'
      );
      return [path, { ...delta, capacityBaselineExists, manifestBaseExists }];
    })
  );
  const ownerPaths = safePaths(Object.keys(capacityOwnerDeltas), 'capacity owner paths');
  const normalizedOwnerDeltas = Object.fromEntries(
    ownerPaths.map(path => {
      const delta = capacityOwnerDeltas[path];
      must(
        delta &&
          Number.isSafeInteger(delta.bytes) &&
          Number.isSafeInteger(delta.currentBytes) &&
          delta.currentBytes >= 0 &&
          [-1, 0, 1].includes(delta.files) &&
          typeof delta.capacityBaselineExists === 'boolean' &&
          typeof delta.currentExists === 'boolean' &&
          delta.files === Number(delta.currentExists) - Number(delta.capacityBaselineExists) &&
          ((delta.currentExists === true && DIGEST_PATTERN.test(delta.currentSha256 ?? '')) ||
            (delta.currentExists === false &&
              delta.currentBytes === 0 &&
              delta.currentSha256 === null)),
        `capacity owner delta is invalid: ${path}`
      );
      return [path, { ...delta }];
    })
  );
  return {
    ...repository,
    origin: identity.origin,
    providerRepository: identity.providerRepository,
    committedChangedPaths: safePaths(
      repository.committedChangedPaths,
      'repository committed changed paths'
    ),
    protectedMainAdvancedPaths: safePaths(
      repository.protectedMainAdvancedPaths,
      'repository protected-main advanced paths'
    ),
    dirtyPaths: safePaths(repository.dirtyPaths, 'repository dirty paths'),
    capacityOwnerDeltas: normalizedOwnerDeltas,
    writerLineCounts,
    writerDeltas: normalizedDeltas,
  };
}
