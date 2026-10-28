import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
export const P2_SOURCE = 'apps/web/src/server/operations/m4-qualification-admin-assignment.test.ts';
export const LEGACY_P2_SOURCE = 'apps/web/src/actions/admin-claims/assign.wrapper.test.ts';
export const P2_SOURCES = Object.freeze([P2_SOURCE, LEGACY_P2_SOURCE]);
const VITE_DYNAMIC_IMPORT_HELPER = '\0vite/dynamic-import-helper.js';
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
  const targets = P2_SOURCES.map(file => canonical(file, undefined, root));
  const reject = (id, importer) => {
    // This exact Vite-generated helper has no filesystem identity.
    if (id === VITE_DYNAMIC_IMPORT_HELPER) return;
    const index = targets.indexOf(canonical(id, importer, root));
    if (index !== -1) throw new Error('P2_AMBIENT_SOURCE_LOAD_REFUSED: ' + P2_SOURCES[index]);
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
  if (P2_SOURCES.some(source => files.filter(file => file === source).length !== 1))
    throw Error('Exact fixed P2 sources missing from ordinary discovery');
  return Object.freeze({
    capsule: P2_SOURCES,
    ambient: Object.freeze(files.filter(file => !P2_SOURCES.includes(file))),
  });
}
