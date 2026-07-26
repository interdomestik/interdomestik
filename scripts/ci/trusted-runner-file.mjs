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
    throw new Error('runner file is outside the trusted root');
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
    throw new Error('runner file is outside the trusted root');
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

function openTrustedRunnerFile(candidatePath, flags, options) {
  const trustedPath = trustedRunnerFile(candidatePath, options);
  const resolvedRoot = path.resolve(options?.runnerTemp ?? process.env.RUNNER_TEMP ?? '');
  const canonicalRoot = fs.realpathSync(`${resolvedRoot}${path.sep}.`);
  if (!trustedPath.startsWith(`${canonicalRoot}${path.sep}`)) {
    throw new Error('runner file is outside the trusted root');
  }
  const descriptor = fs.openSync(trustedPath, flags | fs.constants.O_NOFOLLOW);
  try {
    const descriptorMetadata = fs.fstatSync(descriptor);
    const pathMetadata = fs.statSync(trustedPath);
    if (!descriptorMetadata.isFile()) {
      fail('runner file must be regular');
    }
    if (descriptorMetadata.nlink !== 1) {
      fail('runner file must have exactly one hard link');
    }
    if (
      descriptorMetadata.dev !== pathMetadata.dev ||
      descriptorMetadata.ino !== pathMetadata.ino
    ) {
      fail('runner file changed during validation');
    }
    if (trustedRunnerFile(candidatePath, options) !== trustedPath) {
      fail('runner file changed during validation');
    }

    return descriptor;
  } catch (error) {
    fs.closeSync(descriptor);
    throw error;
  }
}
export function readTrustedRunnerFile(candidatePath, options) {
  const descriptor = openTrustedRunnerFile(candidatePath, fs.constants.O_RDONLY, options);

  try {
    return fs.readFileSync(descriptor, 'utf8');
  } finally {
    fs.closeSync(descriptor);
  }
}

export function appendTrustedRunnerFile(candidatePath, content, options) {
  const descriptor = openTrustedRunnerFile(
    candidatePath,
    fs.constants.O_WRONLY | fs.constants.O_APPEND,
    options
  );

  try {
    fs.appendFileSync(descriptor, content);
  } finally {
    fs.closeSync(descriptor);
  }
}
