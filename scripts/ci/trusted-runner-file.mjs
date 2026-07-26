import fs from 'node:fs';
import path from 'node:path';

function fail(message) {
  throw new Error(message);
}

function isContained(root, candidate) {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

function nearestExistingPath(candidate) {
  let current = candidate;

  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) {
      fail('runner file has no existing parent');
    }
    current = parent;
  }

  return current;
}

function rejectSymlinkComponents(root, candidate) {
  const relativePath = path.relative(root, candidate);
  let current = root;

  for (const segment of relativePath.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    try {
      if (fs.lstatSync(current).isSymbolicLink()) {
        fail('runner file symlinks are not allowed');
      }
    } catch (error) {
      if (error && typeof error === 'object' && error.code === 'ENOENT') return;
      throw error;
    }
  }
}

export function trustedRunnerFile(
  candidatePath,
  { runnerTemp = process.env.RUNNER_TEMP || '' } = {}
) {
  if (typeof runnerTemp !== 'string' || !runnerTemp.trim()) {
    fail('trusted runner root is required');
  }

  const resolvedRoot = path.resolve(runnerTemp);
  let canonicalRoot;
  try {
    canonicalRoot = fs.realpathSync(resolvedRoot);
    if (!fs.statSync(canonicalRoot).isDirectory()) {
      fail('trusted runner root is invalid');
    }
  } catch {
    fail('trusted runner root is invalid');
  }

  if (typeof candidatePath !== 'string' || !candidatePath.trim()) {
    fail('runner file path is required');
  }

  const resolvedCandidate = path.isAbsolute(candidatePath)
    ? path.resolve(candidatePath)
    : path.resolve(resolvedRoot, candidatePath);
  if (!isContained(resolvedRoot, resolvedCandidate)) {
    fail('runner file is outside the trusted root');
  }
  rejectSymlinkComponents(resolvedRoot, resolvedCandidate);
  const existingPath = nearestExistingPath(resolvedCandidate);
  const existingMetadata = fs.lstatSync(existingPath);

  if (existingMetadata.isSymbolicLink()) {
    fail('runner file symlinks are not allowed');
  }

  const canonicalExisting = fs.realpathSync(existingPath);
  const unresolvedSuffix = path.relative(existingPath, resolvedCandidate);
  const canonicalCandidate = path.resolve(canonicalExisting, unresolvedSuffix);

  if (!isContained(canonicalRoot, canonicalCandidate)) {
    fail('runner file is outside the trusted root');
  }

  if (existingPath === resolvedCandidate) {
    if (!existingMetadata.isFile()) {
      fail('runner file must be regular');
    }
    if (existingMetadata.nlink !== 1) {
      fail('runner file must have exactly one hard link');
    }
  } else if (!existingMetadata.isDirectory()) {
    fail('runner file parent must be a directory');
  }

  return canonicalCandidate;
}
