import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
export const P2_SOURCE = 'apps/web/src/actions/admin-claims/assign.wrapper.test.ts';
function canonical(id, importer, root) {
  let clean = id.replace(/[?#].*$/u, '');
  if (clean.startsWith('file:')) clean = fileURLToPath(clean);
  if (clean.startsWith('/@fs/')) clean = clean.slice(4);
  if (clean.startsWith('@/')) clean = path.join(root, 'apps/web/src', clean.slice(2));
  if (!path.isAbsolute(clean))
    clean = path.resolve(importer ? path.dirname(importer.replace(/[?#].*$/u, '')) : root, clean);
  try {
    clean = fs.realpathSync(clean);
  } catch (error) {
    if (!['ENOENT', 'ENOTDIR'].includes(error.code)) throw error;
  }
  return path.normalize(clean);
}
// There is no environment flag, receipt path or serialized authorization bypass.
// The sealed capsule uses a distinct source-bound generated entry, not this Vite path.
export function p2SourceFence(root) {
  const target = canonical(P2_SOURCE, undefined, root);
  const reject = (id, importer) => {
    if (canonical(id, importer, root) === target)
      throw new Error('P2_AMBIENT_SOURCE_LOAD_REFUSED: ' + P2_SOURCE);
  };
  return {
    name: 'protected-p2-exact-source-fence',
    enforce: 'pre',
    resolveId(source, importer) {
      reject(source, importer);
      return null;
    },
    load(id) {
      reject(id);
      return null;
    },
    transform(_code, id) {
      reject(id);
      return null;
    },
  };
}
export function partitionOrdinarySources(files) {
  if (!Array.isArray(files) || new Set(files).size !== files.length)
    throw Error('Duplicate ordinary source discovery');
  if (files.filter(file => file === P2_SOURCE).length !== 1)
    throw Error('Exact P2 source missing from ordinary discovery');
  return Object.freeze({
    capsule: Object.freeze([P2_SOURCE]),
    ambient: Object.freeze(files.filter(file => file !== P2_SOURCE)),
  });
}
