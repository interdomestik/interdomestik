import { lstatSync, realpathSync } from 'node:fs';
import { isAbsolute, join, resolve, sep } from 'node:path';

export function resolveReleasePath(root: string, input: string, { noSymlink = false } = {}) {
  if (typeof root !== 'string' || !isAbsolute(root)) throw new Error('RELEASE_PATH_REJECTED');
  const declaredRoot = resolve(root);
  const canonicalRoot = realpathSync.native(declaredRoot);
  const candidate = resolve(input);
  const exactRoot = candidate === declaredRoot ? declaredRoot : canonicalRoot;
  if (candidate === exactRoot) {
    if (noSymlink && lstatSync(exactRoot).isSymbolicLink())
      throw new Error('RELEASE_PATH_REJECTED');
    return canonicalRoot;
  }

  const canonicalRootWithSep = join(canonicalRoot, sep);
  const rootWithSep = candidate.startsWith(canonicalRootWithSep)
    ? canonicalRootWithSep
    : join(declaredRoot, sep);
  if (!candidate.startsWith(rootWithSep)) throw new Error('RELEASE_PATH_REJECTED');

  const canonical = realpathSync.native(candidate);
  if (canonical !== canonicalRoot && !canonical.startsWith(canonicalRootWithSep))
    throw new Error('RELEASE_PATH_REJECTED');
  if (noSymlink && lstatSync(candidate).isSymbolicLink()) throw new Error('RELEASE_PATH_REJECTED');
  return canonical;
}
