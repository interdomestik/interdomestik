import fs from 'node:fs';
import path from 'node:path';

function fail(message) {
  throw new Error(message);
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
  let current = candidate;

  while (current !== root) {
    try {
      if (fs.lstatSync(current).isSymbolicLink()) {
        fail('runner file symlinks are not allowed');
      }
    } catch (error) {
      if (!(error && typeof error === 'object' && error.code === 'ENOENT')) {
        throw error;
      }
    }

    const parent = path.dirname(current);
    if (parent === current) {
      fail('runner file is outside the trusted root');
    }
    current = parent;
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
  if (resolvedRoot === path.parse(resolvedRoot).root) {
    fail('trusted runner root is invalid');
  }

  let canonicalRoot;
  try {
    canonicalRoot = fs.realpathSync(`${resolvedRoot}${path.sep}.`);
  } catch {
    fail('trusted runner root is invalid');
  }

  if (typeof candidatePath !== 'string' || !candidatePath.trim()) {
    fail('runner file path is required');
  }

  const resolvedCandidate = path.isAbsolute(candidatePath)
    ? path.resolve(candidatePath)
    : path.resolve(resolvedRoot, candidatePath);
  if (!resolvedCandidate.startsWith(`${resolvedRoot}${path.sep}`)) {
    fail('runner file is outside the trusted root');
  }

  const existingPath = nearestExistingPath(resolvedCandidate);
  const existingMetadata = fs.lstatSync(existingPath);

  if (existingMetadata.isSymbolicLink()) {
    fail('runner file symlinks are not allowed');
  }

  const canonicalExisting = fs.realpathSync(existingPath);
  const unresolvedSuffix = path.relative(existingPath, resolvedCandidate);
  const canonicalCandidate = path.resolve(canonicalExisting, unresolvedSuffix);

  if (!canonicalCandidate.startsWith(`${canonicalRoot}${path.sep}`)) {
    fail('runner file is outside the trusted root');
  }

  rejectSymlinkComponents(resolvedRoot, resolvedCandidate);

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
