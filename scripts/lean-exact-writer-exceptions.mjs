import { createHash } from 'node:crypto';

const T116_HASH = '0c1facb7a3c248391ce92b308e592219f32ccefb6c4d67ee859011e8968b4fa5';
const T117B_HASHES = new Set([
  '2e16444a55df145af2d5c0aaa2a1968cbc0215fc4fe0d0970374903dcadd647c',
  'dd9eed913fabad637d2e15e6b08b1eae373532a67a6a923d3f5f164ecaa9a410',
]);
const T117B_CHILD_HASHES = new Map([
  ['T117B-DATA', '18b044d69363404d07682aca7b5944d440cbb1e0066d91cc0cf82578953e3f26'],
  ['T117B-PORTAL', '60de5ce927812137cfdcd620d280d2708b488040ddf02a5796131d4c6c1f04a5'],
  ['T117B-CUTOVER', 'a3b7ba9338ba5e453316a55bd499078855c7c911158f43057dc419276d3d749a'],
]);
const DOMAIN_READ = /^packages\/domain-member\/src\/(?:case-summary\/.+|index\.ts)$/u;

function writerHash(slice) {
  return Array.isArray(slice?.productWriterPaths)
    ? createHash('sha256').update(JSON.stringify(slice.productWriterPaths)).digest('hex')
    : null;
}

export function exactWriterClassification(path, slice) {
  const hash = writerHash(slice);
  if (
    slice?.sliceId === 'T-116-CASE-SUMMARY' &&
    slice?.tier === 2 &&
    hash === T116_HASH &&
    DOMAIN_READ.test(path) &&
    slice.productWriterPaths.includes(path)
  ) {
    return 'domain_read_projection';
  }
  if (
    ((slice?.sliceId === 'T-117B-PORTAL-RUNTIME' && T117B_HASHES.has(hash)) ||
      T117B_CHILD_HASHES.get(slice?.sliceId) === hash) &&
    slice?.tier === 3 &&
    slice.productWriterPaths.includes(path)
  ) {
    return 'tier3_portal_runtime';
  }
  return null;
}

export const isT117BPortalRuntime = slice =>
  exactWriterClassification(slice?.productWriterPaths?.[0], slice) === 'tier3_portal_runtime';
