import { isAbsolute, normalize, posix } from 'node:path';

import { CAPACITY_CATEGORIES } from './repo-size-capacity-schema.mjs';
import { canonicalJson } from './slice-rehearse-core.mjs';

const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/u;
const CANONICAL_PROVIDER_REPOSITORY = 'interdomestik/interdomestik';

function must(condition, message) {
  if (!condition) throw new Error(message);
}

function safePaths(values, label) {
  must(Array.isArray(values), `${label} must be an array`);
  const paths = [...values].sort();
  must(new Set(paths).size === paths.length, `${label} must be unique`);
  must(
    paths.every(
      path =>
        typeof path === 'string' &&
        path &&
        !isAbsolute(path) &&
        path === posix.normalize(path) &&
        normalize(path) === path &&
        path !== '..' &&
        !path.startsWith('../') &&
        !path.includes('/../') &&
        !path.startsWith('./') &&
        !path.includes('\\')
    ),
    `${label} contains an unsafe path`
  );
  return paths;
}

function nonnegativeInteger(value, label) {
  must(Number.isSafeInteger(value) && value >= 0, `${label} is invalid`);
}

export function normalizeGitHubOrigin(origin) {
  must(typeof origin === 'string' && origin, 'repository origin is invalid');
  const match = origin.match(
    /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/u
  );
  must(match, 'repository origin is not a supported GitHub identity');
  const providerRepository = `${match[1]}/${match[2]}`.toLowerCase();
  return {
    origin: `https://github.com/${providerRepository}.git`,
    providerRepository,
  };
}

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

export function repositoryAuthorityStops(manifest, repository) {
  const stops = [];
  const manifestIdentity = normalizeGitHubOrigin(manifest.origin);
  const outsideDirty = repository.dirtyPaths.filter(path => !manifest.writerPaths.includes(path));
  const outsideCommitted = repository.committedChangedPaths.filter(
    path => !manifest.writerPaths.includes(path)
  );
  if (outsideDirty.length)
    stops.push({ code: 'repository:outside-writer-dirty', paths: outsideDirty });
  if (outsideCommitted.length) {
    stops.push({ code: 'repository:outside-writer-committed', paths: outsideCommitted });
  }
  if (repository.origin !== manifestIdentity.origin)
    stops.push({ code: 'repository:origin-mismatch' });
  if (
    repository.providerRepository !== CANONICAL_PROVIDER_REPOSITORY ||
    manifestIdentity.providerRepository !== CANONICAL_PROVIDER_REPOSITORY
  ) {
    stops.push({ code: 'repository:provider-repository-mismatch' });
  }
  if (repository.baseSha !== manifest.baseSha || !repository.baseIsAncestor) {
    stops.push({ code: 'repository:base-identity-mismatch' });
  }
  const protectedMainWriterOverlap = repository.protectedMainAdvancedPaths.filter(path =>
    manifest.writerPaths.includes(path)
  );
  if (protectedMainWriterOverlap.length) {
    stops.push({
      code: 'repository:protected-main-writer-overlap',
      paths: protectedMainWriterOverlap,
    });
  }
  const writerFactPaths = Object.keys(repository.writerDeltas).sort();
  const lineFactPaths = Object.keys(repository.writerLineCounts).sort();
  if (
    canonicalJson(writerFactPaths) !== canonicalJson(manifest.writerPaths) ||
    canonicalJson(lineFactPaths) !== canonicalJson(manifest.writerPaths)
  ) {
    stops.push({ code: 'repository:writer-facts-incomplete' });
  }
  for (const plan of manifest.pathPlans) {
    if (plan.change === 'modify' && repository.writerDeltas[plan.path]?.currentExists === false) {
      stops.push({ code: `repository:writer-missing:${plan.path}` });
    }
  }
  return stops;
}
