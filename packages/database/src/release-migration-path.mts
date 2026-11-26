import { lstatSync, realpathSync } from 'node:fs';
import { isAbsolute, join, resolve, sep } from 'node:path';

export function resolveReleasePath(root: string, input: string, { noSymlink = false } = {}) {
  if (typeof root !== 'string' || !isAbsolute(root)) throw new Error('RELEASE_PATH_REJECTED');
  const declaredRoot = resolve(root);
  const canonicalRoot = realpathSync.native(declaredRoot);
  const candidate = resolve(input);
  const prefix = join(canonicalRoot, sep);
  if (
    candidate !== declaredRoot &&
    candidate !== canonicalRoot &&
    !candidate.startsWith(join(declaredRoot, sep)) &&
    !candidate.startsWith(prefix)
  )
    throw new Error('RELEASE_PATH_REJECTED');

  const canonical = realpathSync.native(candidate);
  if (canonical !== canonicalRoot && !canonical.startsWith(prefix))
    throw new Error('RELEASE_PATH_REJECTED');
  if (noSymlink && lstatSync(candidate).isSymbolicLink()) throw new Error('RELEASE_PATH_REJECTED');
  return canonical;
}
