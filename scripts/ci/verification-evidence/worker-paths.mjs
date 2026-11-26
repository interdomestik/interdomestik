import { accessSync, constants, lstatSync, realpathSync } from 'node:fs';
import path from 'node:path';

const CANONICAL = { canonical: true };
const OPTIONAL = { allowMissing: true };
const OPTIONAL_CANONICAL = { ...OPTIONAL, ...CANONICAL };
const REQUIRED = {};

function requireThat(condition) {
  if (!condition) throw new Error('worker isolation');
}

export function validatePath(value, directory, options = REQUIRED) {
  const candidate = path.resolve(directory, value);
  const relative = path.relative(directory, candidate);
  if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) {
    throw new Error('worker isolation');
  }

  // Check the nearest existing ancestor as well, including for a missing leaf below a symlink.
  let current = candidate;
  while (!lstatSync(current, { throwIfNoEntry: false })) {
    requireThat(options.allowMissing && current !== directory);
    current = path.dirname(current);
  }
  // Resolve symlink targets in filesystem order before checking containment.
  const resolved = realpathSync.native(current);
  const physicalRelative = path.relative(realpathSync.native(directory), resolved);
  if (
    physicalRelative === '..' ||
    physicalRelative.startsWith('..' + path.sep) ||
    path.isAbsolute(physicalRelative)
  ) {
    throw new Error('worker isolation');
  }
  requireThat(!options.canonical || resolved === current);
  return candidate;
}

function accessible(file, mode) {
  try {
    accessSync(file, mode);
    return true;
  } catch (error) {
    if (!['EACCES', 'EPERM', 'ENOENT'].includes(error.code)) throw error;
    return false;
  }
}

function protectedToolPath(file) {
  for (let current = file; ; current = path.dirname(current)) {
    if (accessible(current, constants.W_OK)) return false;
    if (current === path.dirname(current)) return true;
  }
}

export { CANONICAL, OPTIONAL, OPTIONAL_CANONICAL, accessible, protectedToolPath, requireThat };
