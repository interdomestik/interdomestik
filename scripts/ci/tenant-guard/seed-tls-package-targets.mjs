import path from 'node:path/posix';
import { fileURLToPath } from 'node:url';

const ROOT = 'file:///__seed_repository__/';
const PREFIX = '/__seed_repository__/';

export function unsupportedPackageTarget(target) {
  try {
    return [target, decodeURI(target)].some(value => /[%?#]/u.test(value));
  } catch {
    return true;
  }
}

// Keep the old filesystem spelling in the union: URL normalization may only add reachability.
// A synthetic root also prevents URL dot-segment clamping from concealing repository escapes.
export function packageTargetPaths(pkg, target) {
  const paths = [path.normalize(path.join(pkg.dir, target))];
  let normalized;
  try {
    normalized = fileURLToPath(new URL(target, new URL(pkg.file, ROOT)));
  } catch {
    return paths; // Invalid URL encodings are refused independently at the manifest.
  }
  if (!normalized.startsWith(PREFIX)) throw new Error(`incomplete: seed path escape ${target}`);
  return [...new Set([...paths, normalized.slice(PREFIX.length)])];
}
