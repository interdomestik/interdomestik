import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const repoRoot = fs.realpathSync(process.cwd());
const tmpRoots = [os.tmpdir(), '/tmp', '/var/tmp']
  .filter(root => fs.existsSync(root))
  .map(root => fs.realpathSync(root));

function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export function resolveReadableInputPath(inputPath, label, { allowTemp = true } = {}) {
  const resolved = path.resolve(repoRoot, inputPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`${label} does not exist.`);
  }

  const realPath = fs.realpathSync(resolved);
  if (
    !isInside(repoRoot, realPath) &&
    !(allowTemp && tmpRoots.some(root => isInside(root, realPath)))
  ) {
    throw new Error(`${label} must stay inside an allowed input directory.`);
  }

  return realPath;
}

export function resolveRepoPath(inputPath, fallback, label = 'Path') {
  const resolved = path.resolve(repoRoot, inputPath || fallback);
  const checkedPath = fs.existsSync(resolved) ? fs.realpathSync(resolved) : resolved;
  if (!isInside(repoRoot, checkedPath)) {
    throw new Error(`${label} must stay inside the repository.`);
  }

  return checkedPath;
}
